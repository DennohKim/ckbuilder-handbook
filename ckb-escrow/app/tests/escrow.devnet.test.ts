import { beforeAll, describe, expect, it } from "vitest";
import { ccc } from "@ckb-ccc/core";
import { DEV_ACCOUNTS } from "../src/ckb/accounts";
import { createDevnetClient } from "../src/ckb/client";
import {
  ESCROW_CODE_HASH,
  fundEscrow,
  listEscrows,
  outPointKey,
  spendEscrow,
  type EscrowRecord,
  type EscrowTerms,
  type Party,
} from "../src/ckb/escrow";
import { encodeSince } from "../src/ckb/since";

/**
 * Drives the escrow lock against a running OffCKB devnet, exercising the same
 * module the browser app uses. Requires `offckb node` and a deployed escrow.
 */

const TIMEOUT_BLOCKS = 3n;
const RELATIVE_BLOCK_TIMEOUT = encodeSince({
  relative: true,
  metric: "block",
  value: TIMEOUT_BLOCKS,
});

const client = createDevnetClient();

let buyer: Party;
let seller: Party;
let arbiter: Party;

async function partyFor(role: Party["role"], accountIndex: number): Promise<Party> {
  const account = DEV_ACCOUNTS[accountIndex];
  const signer = new ccc.SignerCkbPrivateKey(client, account.privateKey);
  const address = await signer.getRecommendedAddressObj();
  return { role, signer, lock: address.script };
}

function termsWith(timeout: bigint): EscrowTerms {
  return {
    buyer: buyer.lock.hash(),
    seller: seller.lock.hash(),
    arbiter: arbiter.lock.hash(),
    timeout,
  };
}

async function commit(txHash: ccc.Hex): Promise<void> {
  const res = await client.waitTransaction(txHash, 0, 120_000);
  expect(res?.status, `tx ${txHash} did not commit`).toBe("committed");
}

/** Funds a fresh escrow and returns the resulting live cell. */
async function fund(timeout: bigint, amountCkb = "200"): Promise<EscrowRecord> {
  const terms = termsWith(timeout);
  const txHash = await fundEscrow({
    signer: buyer.signer,
    terms,
    capacity: ccc.fixedPointFrom(amountCkb),
  });
  await commit(txHash);

  const escrows = await listEscrows(client);
  const created = escrows.find((e) => e.outPoint.txHash === txHash);
  expect(created, "funded escrow cell not found by prefix search").toBeDefined();
  return created!;
}

async function isLive(escrow: EscrowRecord): Promise<boolean> {
  const escrows = await listEscrows(client);
  return escrows.some((e) => outPointKey(e.outPoint) === outPointKey(escrow.outPoint));
}

async function balanceOf(party: Party): Promise<bigint> {
  let total = 0n;
  for await (const cell of client.findCellsByLock(party.lock, undefined, true)) {
    total += cell.cellOutput.capacity;
  }
  return total;
}

async function waitBlocks(count: bigint): Promise<void> {
  const start = await client.getTip();
  const target = start + count + 1n;
  for (let i = 0; i < 120; i++) {
    if ((await client.getTip()) >= target) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("devnet stopped producing blocks");
}

beforeAll(async () => {
  [buyer, seller, arbiter] = await Promise.all([
    partyFor("buyer", 0),
    partyFor("seller", 1),
    partyFor("arbiter", 2),
  ]);
  const tip = await client.getTip();
  expect(tip, "devnet is not reachable on 127.0.0.1:8114").toBeGreaterThan(0n);
  console.log(`devnet tip ${tip}, escrow ${ESCROW_CODE_HASH}`);
}, 60_000);

describe("escrow unlock paths", () => {
  it("releases to the seller when buyer and seller both consent", async () => {
    const escrow = await fund(0n);
    const before = await balanceOf(seller);

    const txHash = await spendEscrow({
      client,
      escrow,
      parties: [buyer, seller],
      recipient: seller.lock,
      initiator: buyer,
    });
    await commit(txHash);
    console.log(`mutual release: ${txHash}`);

    expect(await isLive(escrow)).toBe(false);
    expect(await balanceOf(seller)).toBe(before + escrow.capacity);
  }, 180_000);

  it("lets the arbiter settle a dispute in the seller's favour", async () => {
    const escrow = await fund(0n);
    const before = await balanceOf(seller);

    const txHash = await spendEscrow({
      client,
      escrow,
      parties: [arbiter, seller],
      recipient: seller.lock,
      initiator: arbiter,
    });
    await commit(txHash);
    console.log(`arbitrated release to seller: ${txHash}`);

    expect(await isLive(escrow)).toBe(false);
    expect(await balanceOf(seller)).toBe(before + escrow.capacity);
  }, 180_000);

  it("lets the arbiter settle a dispute in the buyer's favour", async () => {
    const escrow = await fund(0n);

    const txHash = await spendEscrow({
      client,
      escrow,
      parties: [arbiter, buyer],
      recipient: buyer.lock,
      initiator: arbiter,
    });
    await commit(txHash);
    console.log(`arbitrated release to buyer: ${txHash}`);

    expect(await isLive(escrow)).toBe(false);
  }, 180_000);

  it("refunds the buyer alone once the deadline has elapsed", async () => {
    const escrow = await fund(RELATIVE_BLOCK_TIMEOUT);
    await waitBlocks(TIMEOUT_BLOCKS);

    const txHash = await spendEscrow({
      client,
      escrow,
      parties: [buyer],
      recipient: buyer.lock,
      initiator: buyer,
      since: RELATIVE_BLOCK_TIMEOUT,
    });
    await commit(txHash);
    console.log(`timeout refund: ${txHash}`);

    expect(await isLive(escrow)).toBe(false);
  }, 240_000);
});

describe("escrow rejections", () => {
  it("rejects a refund before the deadline", async () => {
    // A long deadline so the attempt is guaranteed to be premature.
    const timeout = encodeSince({ relative: true, metric: "block", value: 5_000n });
    const escrow = await fund(timeout);

    // The script would accept this — the buyer is present and the committed
    // `since` matches the deadline — but consensus refuses to include an input
    // whose relative deadline has not elapsed, so it never reaches the VM.
    await expect(
      spendEscrow({
        client,
        escrow,
        parties: [buyer],
        recipient: buyer.lock,
        initiator: buyer,
        since: timeout,
      }),
    ).rejects.toThrow(/immature/i);

    expect(await isLive(escrow)).toBe(true);
  }, 180_000);

  it("rejects the buyer acting alone when no deadline was set", async () => {
    // Regression guard for the timeout=0 bug: a zero deadline used to satisfy
    // the maturity check trivially, letting the buyer drain the escrow.
    const escrow = await fund(0n);

    await expect(
      spendEscrow({
        client,
        escrow,
        parties: [buyer],
        recipient: buyer.lock,
        initiator: buyer,
      }),
    ).rejects.toThrow();

    expect(await isLive(escrow)).toBe(true);
  }, 180_000);

  it("rejects an unrelated party", async () => {
    const escrow = await fund(0n);
    const stranger = await partyFor("buyer", 3);

    await expect(
      spendEscrow({
        client,
        escrow,
        parties: [stranger],
        recipient: stranger.lock,
        initiator: stranger,
      }),
    ).rejects.toThrow();

    expect(await isLive(escrow)).toBe(true);
  }, 180_000);
});
