const ccc = require("@ckb-ccc/core");

const RPC = "http://127.0.0.1:8114";

// Deployed escrow script on the OffCKB devnet (see ../deployment/scripts.json).
const ESCROW = {
  codeHash:
    "0x81d2fee6790006229e1d7b7f2f7302c12d55b48803fa132b42922078541d6b76",
  hashType: "data2",
  dep: {
    outPoint: {
      txHash:
        "0x3a2e810a7fdee0d4fe9ec440d616ee91af6ae8dc5e9fbc4b76ec0adba7002497",
      index: 0,
    },
    depType: "code",
  },
};

// secp256k1 sighash dep group on the OffCKB devnet genesis.
const SECP_DEVNET_DEP = {
  txHash: "0x4d804f1495612631da202fe9902fa9899118554b08138cfe5dfb50e1ede76293",
  index: 0,
};

// OffCKB prefunded accounts acting as the three escrow parties.
const BUYER_KEY =
  "0x6109170b275a09ad54877b82f7d9930f88cab5717d484fb4741ae9d1dd078cd6";
const SELLER_KEY =
  "0x9f315d5a9618a39fdc487c7a67a8581d40b045bd7a42d83648ca80ef3b2cb4a1";
const ARBITER_ARG = "0x9d1edebedf8f026c0d597c4c5cd3f45dec1f7557";

const ESCROW_AMOUNT = ccc.fixedPointFrom(200); // 200 CKB
const FEE = ccc.fixedPointFrom("0.001");

const strip = (h) => h.replace(/^0x/, "");

async function firstCell(client, lock) {
  for await (const cell of client.findCellsByLock(lock, undefined, true)) {
    return cell;
  }
  throw new Error("no live cell found for lock");
}

async function main() {
  // Start from the built-in testnet script map (so every known lock type
  // resolves for address enumeration) and override only the secp256k1 dep
  // group with the OffCKB devnet's genesis out-point.
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

  const buyer = new ccc.SignerCkbPrivateKey(client, BUYER_KEY);
  const seller = new ccc.SignerCkbPrivateKey(client, SELLER_KEY);

  const buyerLock = (await buyer.getRecommendedAddressObj()).script;
  const sellerLock = (await seller.getRecommendedAddressObj()).script;
  const secp = await client.getKnownScript(ccc.KnownScript.Secp256k1Blake160);
  const arbiterLock = ccc.Script.from({
    codeHash: secp.codeHash,
    hashType: secp.hashType,
    args: ARBITER_ARG,
  });

  const escrowArgs =
    "0x" +
    strip(buyerLock.hash()) +
    strip(sellerLock.hash()) +
    strip(arbiterLock.hash()) +
    "0000000000000000"; // timeout = 0 (timeout path disabled; mutual release)
  const escrowLock = ccc.Script.from({
    codeHash: ESCROW.codeHash,
    hashType: ESCROW.hashType,
    args: escrowArgs,
  });

  // ---- FUND: buyer locks 200 CKB into an escrow cell ----
  const fundTx = ccc.Transaction.from({
    outputs: [{ lock: escrowLock, capacity: ESCROW_AMOUNT }],
    outputsData: ["0x"],
  });
  await fundTx.completeInputsByCapacity(buyer);
  await fundTx.completeFeeBy(buyer, 1000);
  const fundHash = await buyer.sendTransaction(fundTx);
  console.log("fund tx sent:      ", fundHash);
  await client.waitTransaction(fundHash);
  console.log("fund tx committed. Escrow cell:", `${fundHash}:0`);

  // ---- RELEASE (mutual path): buyer + seller co-sign, funds to seller ----
  const buyerCell = await firstCell(client, buyerLock);
  const sellerCell = await firstCell(client, sellerLock);
  const bCap = buyerCell.cellOutput.capacity;
  const sCap = sellerCell.cellOutput.capacity;

  const releaseTx = ccc.Transaction.from({
    inputs: [
      { previousOutput: { txHash: fundHash, index: 0 } }, // escrow cell
      { previousOutput: buyerCell.outPoint }, // buyer presence
      { previousOutput: sellerCell.outPoint }, // seller presence
    ],
    outputs: [
      // seller receives the escrowed funds plus their own presence cell back
      { lock: sellerLock, capacity: ESCROW_AMOUNT + sCap },
      // buyer's presence cell returns to buyer, less the fee
      { lock: buyerLock, capacity: bCap - FEE },
    ],
    outputsData: ["0x", "0x"],
  });
  releaseTx.addCellDeps(ccc.CellDep.from(ESCROW.dep));
  await releaseTx.addCellDepsOfKnownScripts(
    client,
    ccc.KnownScript.Secp256k1Blake160,
  );

  const signedBySeller = await seller.signTransaction(releaseTx);
  const signedByBoth = await buyer.signTransaction(signedBySeller);
  const releaseHash = await client.sendTransaction(signedByBoth);
  console.log("release tx sent:   ", releaseHash);
  await client.waitTransaction(releaseHash);
  console.log("release tx committed. 200 CKB released to seller.");

  console.log(
    JSON.stringify(
      { fundTx: fundHash, releaseTx: releaseHash, escrowLockArgs: escrowArgs },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
