import { ccc } from "@ckb-ccc/connector-react";
import { DEV_ACCOUNTS } from "../ckb/accounts";
import type { PartyConfig, ResolvedParty, SignerSource } from "../hooks/useParties";
import { ROLES } from "../hooks/useParties";
import type { Role } from "../ckb/escrow";

const WALLET_VALUE = "wallet";

function sourceToValue(source: SignerSource): string {
  return source.kind === "wallet" ? WALLET_VALUE : String(source.index);
}

function valueToSource(value: string): SignerSource {
  return value === WALLET_VALUE ? { kind: "wallet" } : { kind: "dev", index: Number(value) };
}

export function PartyPicker({
  config,
  onChange,
  parties,
  walletConnected,
}: {
  config: PartyConfig;
  onChange: (config: PartyConfig) => void;
  parties?: Record<Role, ResolvedParty>;
  walletConnected: boolean;
}) {
  const { open, disconnect, wallet } = ccc.useCcc();

  return (
    <section className="card">
      <div className="card-head">
        <h2>Parties</h2>
        {walletConnected ? (
          <button className="ghost" onClick={() => disconnect()}>
            Disconnect {wallet?.name ?? "wallet"}
          </button>
        ) : (
          <button className="ghost" onClick={() => open()}>
            Connect wallet
          </button>
        )}
      </div>
      <p className="muted">
        Each role needs a signer. Devnet accounts are prefunded and can sign on any role, so
        the full flow works in one browser; a connected wallet can take one role and sign for
        itself.
      </p>
      <div className="parties">
        {ROLES.map((role) => (
          <label key={role} className="party">
            <span className="role">{role}</span>
            <select
              value={sourceToValue(config[role])}
              onChange={(e) => onChange({ ...config, [role]: valueToSource(e.target.value) })}
            >
              {DEV_ACCOUNTS.map((account) => (
                <option key={account.index} value={account.index}>
                  {account.label}
                </option>
              ))}
              {walletConnected ? <option value={WALLET_VALUE}>Connected wallet</option> : null}
            </select>
            <code className="addr" title={parties?.[role]?.address}>
              {parties?.[role]?.address ?? "…"}
            </code>
          </label>
        ))}
      </div>
    </section>
  );
}
