import { ccc } from "@ckb-ccc/core";
import escrowScript from "./escrow-script.json";
import { describeSince } from "./since";

export const ESCROW_CODE_HASH = escrowScript.codeHash as ccc.Hex;
export const ESCROW_HASH_TYPE = escrowScript.hashType as ccc.HashType;
export const ESCROW_CELL_DEP = ccc.CellDep.from(escrowScript.cellDeps[0].cellDep);

const HASH_LEN = 32;
const TIMEOUT_LEN = 8;
export const ESCROW_ARGS_LEN = HASH_LEN * 3 + TIMEOUT_LEN;

export type Role = "buyer" | "seller" | "arbiter";

export type EscrowTerms = {
  buyer: ccc.Hex;
  seller: ccc.Hex;
  arbiter: ccc.Hex;
  timeout: bigint;
};

/** args layout: buyer(32) ‖ seller(32) ‖ arbiter(32) ‖ timeout(8, LE `since`). */
export function encodeEscrowArgs(terms: EscrowTerms): ccc.Hex {
  const bytes = new Uint8Array(ESCROW_ARGS_LEN);
  bytes.set(ccc.bytesFrom(terms.buyer), 0);
  bytes.set(ccc.bytesFrom(terms.seller), HASH_LEN);
  bytes.set(ccc.bytesFrom(terms.arbiter), HASH_LEN * 2);
  bytes.set(ccc.numToBytes(terms.timeout, TIMEOUT_LEN), HASH_LEN * 3);
  return ccc.hexFrom(bytes);
}

export function decodeEscrowArgs(args: ccc.HexLike): EscrowTerms | undefined {
  const bytes = ccc.bytesFrom(args);
  if (bytes.length !== ESCROW_ARGS_LEN) return undefined;
  return {
    buyer: ccc.hexFrom(bytes.slice(0, HASH_LEN)),
    seller: ccc.hexFrom(bytes.slice(HASH_LEN, HASH_LEN * 2)),
    arbiter: ccc.hexFrom(bytes.slice(HASH_LEN * 2, HASH_LEN * 3)),
    timeout: ccc.numLeFromBytes(bytes.slice(HASH_LEN * 3)),
  };
}

export function escrowLock(terms: EscrowTerms): ccc.Script {
  return ccc.Script.from({
    codeHash: ESCROW_CODE_HASH,
    hashType: ESCROW_HASH_TYPE,
    args: encodeEscrowArgs(terms),
  });
}

export type EscrowRecord = {
  outPoint: ccc.OutPoint;
  capacity: bigint;
  lock: ccc.Script;
  terms: EscrowTerms;
};

export function outPointKey(outPoint: ccc.OutPoint): string {
  return `${outPoint.txHash}:${outPoint.index}`;
}

/**
 * There is no contract account to query for a balance. Live escrows are found
 * by asking the indexer for cells whose lock *starts with* the escrow code
 * hash — a prefix search over the lock script — and then reading each cell's
 * own args to recover its terms. State lives in the cells, not in the script.
 */
export async function listEscrows(client: ccc.Client): Promise<EscrowRecord[]> {
  const records: EscrowRecord[] = [];
  for await (const cell of client.findCells({
    script: { codeHash: ESCROW_CODE_HASH, hashType: ESCROW_HASH_TYPE, args: "0x" },
    scriptType: "lock",
    scriptSearchMode: "prefix",
    withData: false,
  })) {
    const terms = decodeEscrowArgs(cell.cellOutput.lock.args);
    if (!terms) continue;
    records.push({
      outPoint: cell.outPoint,
      capacity: cell.cellOutput.capacity,
      lock: cell.cellOutput.lock,
      terms,
    });
  }
  return records;
}

export function roleOf(terms: EscrowTerms, lockHash: ccc.Hex): Role | undefined {
  const hash = lockHash.toLowerCase();
  if (terms.buyer.toLowerCase() === hash) return "buyer";
  if (terms.seller.toLowerCase() === hash) return "seller";
  if (terms.arbiter.toLowerCase() === hash) return "arbiter";
  return undefined;
}

export type UnlockPath = "mutual" | "arbitrated" | "refund";

export function rolesRequiredFor(path: UnlockPath, favouring: Role): Role[] {
  switch (path) {
    case "mutual":
      return ["buyer", "seller"];
    case "arbitrated":
      return ["arbiter", favouring === "buyer" ? "buyer" : "seller"];
    case "refund":
      return ["buyer"];
  }
}

export function describeTerms(terms: EscrowTerms): string {
  return `timeout: ${describeSince(terms.timeout)}`;
}

export type Party = {
  role: Role;
  lock: ccc.Script;
  signer: ccc.Signer;
};

/**
 * A party consents by contributing one of its own live cells as an input: that
 * input's lock verifies the signature, so the escrow only has to notice which
 * lock hashes are present. This finds a cell to spend for that purpose.
 */
async function findPresenceCell(
  client: ccc.Client,
  lock: ccc.Script,
  used: Set<string>,
): Promise<ccc.Cell> {
  for await (const cell of client.findCellsByLock(lock, undefined, true)) {
    if (used.has(outPointKey(cell.outPoint))) continue;
    // A cell carrying data or a type script would drag its own validation
    // rules into the transaction; a presence input only needs to prove consent.
    if (cell.outputData !== "0x" || cell.cellOutput.type) continue;
    return cell;
  }
  throw new Error(`no spendable cell found for ${lock.hash().slice(0, 10)}…`);
}

export async function fundEscrow(params: {
  signer: ccc.Signer;
  terms: EscrowTerms;
  capacity: bigint;
}): Promise<ccc.Hex> {
  const tx = ccc.Transaction.from({
    outputs: [{ lock: escrowLock(params.terms), capacity: params.capacity }],
    outputsData: ["0x"],
  });
  await tx.completeInputsByCapacity(params.signer);
  await tx.completeFeeBy(params.signer, 1000);
  return params.signer.sendTransaction(tx);
}

/**
 * Spends an escrow cell down one of its unlock paths. Every consenting party
 * contributes a presence input and gets that capacity straight back; the
 * escrowed capacity itself goes to `recipient`. The fee is taken out of the
 * initiator's returned cell rather than silently absorbing anyone else's.
 */
export async function spendEscrow(params: {
  client: ccc.Client;
  escrow: EscrowRecord;
  parties: Party[];
  recipient: ccc.Script;
  initiator: Party;
  since?: bigint;
}): Promise<ccc.Hex> {
  const { client, escrow, parties, recipient, initiator } = params;

  const used = new Set([outPointKey(escrow.outPoint)]);
  const presence: { party: Party; cell: ccc.Cell }[] = [];
  for (const party of parties) {
    const cell = await findPresenceCell(client, party.lock, used);
    used.add(outPointKey(cell.outPoint));
    presence.push({ party, cell });
  }

  let tx = ccc.Transaction.from({
    inputs: [
      { previousOutput: escrow.outPoint, since: params.since ?? 0n },
      ...presence.map((p) => ({ previousOutput: p.cell.outPoint })),
    ],
    outputs: [
      { lock: recipient, capacity: escrow.capacity },
      ...presence.map((p) => ({
        lock: p.cell.cellOutput.lock,
        capacity: p.cell.cellOutput.capacity,
      })),
    ],
    outputsData: ["0x", ...presence.map(() => "0x")],
  });

  // The escrow code cell is not owned by any signer, so its dep is added by
  // hand; each signer then adds the deps and witness placeholders its own lock
  // needs, which has to happen before the fee is sized off the tx.
  tx.addCellDeps(ESCROW_CELL_DEP);
  for (const party of parties) {
    tx = await party.signer.prepareTransaction(tx);
  }

  const initiatorIndex = presence.findIndex((p) => p.party === initiator);
  if (initiatorIndex < 0) throw new Error("initiator must be one of the consenting parties");
  await tx.completeFeeChangeToOutput(initiator.signer, initiatorIndex + 1, 1000);

  for (const party of parties) {
    tx = await party.signer.signTransaction(tx);
  }
  return client.sendTransaction(tx);
}
