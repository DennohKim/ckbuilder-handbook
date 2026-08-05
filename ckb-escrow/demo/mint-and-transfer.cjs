const ccc = require("@ckb-ccc/core");
const scripts = require("../deployment/scripts.json");

const RPC = "http://127.0.0.1:8114";

// Deployed UDT type script on the OffCKB devnet, read from the deployment
// record so a redeploy (which changes the code hash) doesn't leave this stale.
const UDT = {
  codeHash: scripts.devnet.udt.codeHash,
  hashType: scripts.devnet.udt.hashType,
  dep: scripts.devnet.udt.cellDeps[0].cellDep,
};

// secp256k1 sighash dep group on the OffCKB devnet genesis.
const SECP_DEVNET_DEP = {
  txHash: "0x4d804f1495612631da202fe9902fa9899118554b08138cfe5dfb50e1ede76293",
  index: 0,
};

// OffCKB prefunded accounts. The owner is the only party allowed to mint; the
// holder and receiver are ordinary users bound by the balance rule.
const OWNER_KEY =
  "0x6109170b275a09ad54877b82f7d9930f88cab5717d484fb4741ae9d1dd078cd6";
const HOLDER_KEY =
  "0x9f315d5a9618a39fdc487c7a67a8581d40b045bd7a42d83648ca80ef3b2cb4a1";
const RECEIVER_ARG = "0x9d1edebedf8f026c0d597c4c5cd3f45dec1f7557";

const TOKEN_CELL_CAPACITY = ccc.fixedPointFrom(200);
const SUPPLY = 1_000_000n;
const SENT = 400_000n;

// sUDT stores the amount as a little-endian u128 in the first 16 bytes of the
// cell's data.
const amountData = (amount) =>
  "0x" + Buffer.from(new Uint8Array(16).map((_, i) =>
    Number((amount >> BigInt(8 * i)) & 0xffn))).toString("hex");

const readAmount = (data) =>
  Buffer.from(data.replace(/^0x/, ""), "hex")
    .subarray(0, 16)
    .reduce((acc, byte, i) => acc + (BigInt(byte) << BigInt(8 * i)), 0n);

async function main() {
  const defaultScripts = new ccc.ClientPublicTestnet().scripts;
  const client = new ccc.ClientPublicTestnet({
    url: RPC,
    scripts: {
      ...defaultScripts,
      [ccc.KnownScript.Secp256k1Blake160]: {
        codeHash:
          "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
        hashType: "type",
        cellDeps: [
          { cellDep: { outPoint: SECP_DEVNET_DEP, depType: "depGroup" } },
        ],
      },
    },
  });

  const owner = new ccc.SignerCkbPrivateKey(client, OWNER_KEY);
  const holder = new ccc.SignerCkbPrivateKey(client, HOLDER_KEY);

  const ownerLock = (await owner.getRecommendedAddressObj()).script;
  const holderLock = (await holder.getRecommendedAddressObj()).script;
  const secp = await client.getKnownScript(ccc.KnownScript.Secp256k1Blake160);
  const receiverLock = ccc.Script.from({
    codeHash: secp.codeHash,
    hashType: secp.hashType,
    args: RECEIVER_ARG,
  });

  // The token's identity is its type script, and that script's args name the
  // owner. A different owner is a different token.
  const udtType = ccc.Script.from({
    codeHash: UDT.codeHash,
    hashType: UDT.hashType,
    args: ownerLock.hash(),
  });
  console.log("token type script hash:", udtType.hash());

  const addDeps = async (tx) => {
    tx.addCellDeps(ccc.CellDep.from(UDT.dep));
    await tx.addCellDepsOfKnownScripts(
      client,
      ccc.KnownScript.Secp256k1Blake160,
    );
  };

  // ---- MINT: owner mode creates supply from nothing ----
  const mintTx = ccc.Transaction.from({
    outputs: [
      { lock: holderLock, type: udtType, capacity: TOKEN_CELL_CAPACITY },
    ],
    outputsData: [amountData(SUPPLY)],
  });
  await addDeps(mintTx);
  await mintTx.completeInputsByCapacity(owner);
  await mintTx.completeFeeBy(owner, 1000);
  const mintHash = await owner.sendTransaction(mintTx);
  console.log("mint tx sent:      ", mintHash);
  await client.waitTransaction(mintHash);
  console.log(`mint tx committed. ${SUPPLY} tokens to holder.`);

  // ---- TRANSFER: the holder moves tokens with no owner involved, so the
  // balance rule is the only thing authorising it ----
  const transferTx = ccc.Transaction.from({
    inputs: [{ previousOutput: { txHash: mintHash, index: 0 } }],
    outputs: [
      { lock: receiverLock, type: udtType, capacity: TOKEN_CELL_CAPACITY },
      { lock: holderLock, type: udtType, capacity: TOKEN_CELL_CAPACITY },
    ],
    outputsData: [amountData(SENT), amountData(SUPPLY - SENT)],
  });
  await addDeps(transferTx);
  await transferTx.completeInputsByCapacity(holder);
  await transferTx.completeFeeBy(holder, 1000);
  const transferHash = await holder.sendTransaction(transferTx);
  console.log("transfer tx sent:  ", transferHash);
  await client.waitTransaction(transferHash);
  console.log(`transfer tx committed. ${SENT} to receiver, ${SUPPLY - SENT} back to holder.`);

  const received = await client.getCell({ txHash: transferHash, index: 0 });
  const change = await client.getCell({ txHash: transferHash, index: 1 });
  console.log("on-chain receiver balance:", readAmount(received.outputData));
  console.log("on-chain holder balance:  ", readAmount(change.outputData));

  // ---- INFLATION: the same shape, but the outputs total more than the
  // inputs. Consensus must refuse it. ----
  const inflateTx = ccc.Transaction.from({
    inputs: [{ previousOutput: { txHash: transferHash, index: 1 } }],
    outputs: [
      { lock: receiverLock, type: udtType, capacity: TOKEN_CELL_CAPACITY },
      { lock: holderLock, type: udtType, capacity: TOKEN_CELL_CAPACITY },
    ],
    outputsData: [amountData(SUPPLY), amountData(SUPPLY)],
  });
  await addDeps(inflateTx);
  await inflateTx.completeInputsByCapacity(holder);
  await inflateTx.completeFeeBy(holder, 1000);

  let inflateRejected = null;
  try {
    const h = await holder.sendTransaction(inflateTx);
    console.log("!! inflation was ACCEPTED, which is a bug:", h);
    process.exitCode = 1;
  } catch (e) {
    inflateRejected = String(e.message ?? e);
    console.log("inflation rejected by the chain, as expected");
    console.log("  ", inflateRejected.split("\n")[0]);
  }

  console.log(
    JSON.stringify(
      {
        udtCodeHash: UDT.codeHash,
        tokenTypeHash: udtType.hash(),
        mintTx: mintHash,
        transferTx: transferHash,
        inflationRejected: inflateRejected !== null,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
