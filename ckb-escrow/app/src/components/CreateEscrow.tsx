import { useState } from "react";
import type { Role } from "../ckb/escrow";
import { encodeSince } from "../ckb/since";
import type { ResolvedParty } from "../hooks/useParties";

export type TimeoutMode = "none" | "relative-blocks";

export function CreateEscrow({
  parties,
  busy,
  onFund,
}: {
  parties?: Record<Role, ResolvedParty>;
  busy: boolean;
  onFund: (amountCkb: string, timeout: bigint) => void;
}) {
  const [amount, setAmount] = useState("200");
  const [mode, setMode] = useState<TimeoutMode>("relative-blocks");
  const [blocks, setBlocks] = useState("3");

  const timeout =
    mode === "none" ? 0n : encodeSince({ relative: true, metric: "block", value: BigInt(blocks || 0) });

  const disabled = busy || !parties || Number(amount) < 61;

  return (
    <section className="card">
      <h2>Create escrow</h2>
      <p className="muted">
        The buyer locks capacity into a cell whose lock is the escrow script. The cell holds the
        funds — there is no contract balance.
      </p>
      <div className="row">
        <label>
          <span>Amount (CKB)</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        </label>
        <label>
          <span>Refund deadline</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as TimeoutMode)}>
            <option value="relative-blocks">Relative blocks</option>
            <option value="none">None</option>
          </select>
        </label>
        {mode === "relative-blocks" ? (
          <label>
            <span>Blocks after funding</span>
            <input value={blocks} onChange={(e) => setBlocks(e.target.value)} inputMode="numeric" />
          </label>
        ) : null}
      </div>
      <p className="muted small">
        {mode === "none"
          ? "timeout = 0 — the refund path is disabled and the escrow can only settle mutually or through the arbiter."
          : `timeout = 0x${timeout.toString(16)} — a since value the buyer's refund input must commit to. Consensus refuses the transaction until ${blocks || 0} block(s) have passed since funding.`}
      </p>
      <button disabled={disabled} onClick={() => onFund(amount, timeout)}>
        {busy ? "Working…" : `Fund ${amount} CKB`}
      </button>
      {Number(amount) < 61 ? (
        <p className="warn small">A cell needs at least 61 CKB to cover its own storage.</p>
      ) : null}
    </section>
  );
}
