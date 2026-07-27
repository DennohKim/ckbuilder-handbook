import { ccc } from "@ckb-ccc/connector-react";
import type { EscrowRecord, Role } from "../ckb/escrow";
import { outPointKey } from "../ckb/escrow";
import { describeSince } from "../ckb/since";
import type { ResolvedParty } from "../hooks/useParties";

export type EscrowAction =
  | { kind: "mutual" }
  | { kind: "arbitrated"; favouring: "buyer" | "seller" }
  | { kind: "refund" };

/** The app can only drive an escrow whose three parties it holds signers for. */
function matchesConfiguredParties(
  escrow: EscrowRecord,
  parties: Record<Role, ResolvedParty>,
): boolean {
  return (
    escrow.terms.buyer.toLowerCase() === parties.buyer.lockHash.toLowerCase() &&
    escrow.terms.seller.toLowerCase() === parties.seller.lockHash.toLowerCase() &&
    escrow.terms.arbiter.toLowerCase() === parties.arbiter.lockHash.toLowerCase()
  );
}

export function EscrowList({
  escrows,
  parties,
  busy,
  onAction,
  onRefresh,
}: {
  escrows: EscrowRecord[];
  parties?: Record<Role, ResolvedParty>;
  busy: boolean;
  onAction: (escrow: EscrowRecord, action: EscrowAction) => void;
  onRefresh: () => void;
}) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>Live escrows</h2>
        <button className="ghost" onClick={onRefresh}>
          Refresh
        </button>
      </div>
      <p className="muted">
        Found by prefix-searching the indexer for cells whose lock starts with the escrow code
        hash, then decoding each cell's own args.
      </p>
      {escrows.length === 0 ? (
        <p className="muted">No live escrow cells on this devnet.</p>
      ) : (
        <ul className="escrows">
          {escrows.map((escrow) => {
            const ours = parties ? matchesConfiguredParties(escrow, parties) : false;
            const refundable = escrow.terms.timeout !== 0n;
            return (
              <li key={outPointKey(escrow.outPoint)} className="escrow">
                <div className="escrow-head">
                  <strong>{ccc.fixedPointToString(escrow.capacity)} CKB</strong>
                  <span className="muted small">{describeSince(escrow.terms.timeout)}</span>
                </div>
                <code className="hash">{outPointKey(escrow.outPoint)}</code>
                {ours ? (
                  <div className="actions">
                    <button disabled={busy} onClick={() => onAction(escrow, { kind: "mutual" })}>
                      Release to seller (mutual)
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => onAction(escrow, { kind: "arbitrated", favouring: "seller" })}
                    >
                      Arbitrate → seller
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => onAction(escrow, { kind: "arbitrated", favouring: "buyer" })}
                    >
                      Arbitrate → buyer
                    </button>
                    <button
                      disabled={busy || !refundable}
                      title={
                        refundable
                          ? undefined
                          : "This escrow was created with timeout = 0, so the refund path is disabled."
                      }
                      onClick={() => onAction(escrow, { kind: "refund" })}
                    >
                      Refund to buyer (timeout)
                    </button>
                  </div>
                ) : (
                  <p className="muted small">
                    Created by a different set of parties — no signers configured for it.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
