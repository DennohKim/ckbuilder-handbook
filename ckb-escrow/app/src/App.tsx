import { useCallback, useEffect, useRef, useState } from "react";
import { ccc } from "@ckb-ccc/connector-react";
import { CreateEscrow } from "./components/CreateEscrow";
import { EscrowList, type EscrowAction } from "./components/EscrowList";
import { PartyPicker } from "./components/PartyPicker";
import { TxLog, type LogEntry } from "./components/TxLog";
import { DEVNET_RPC, DEVNET_SCRIPT_NAMES } from "./ckb/client";
import {
  ESCROW_CODE_HASH,
  fundEscrow,
  listEscrows,
  spendEscrow,
  type EscrowRecord,
  type Party,
} from "./ckb/escrow";
import { DEFAULT_PARTY_CONFIG, useParties, type PartyConfig } from "./hooks/useParties";

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function App() {
  const { client } = ccc.useCcc();
  const wallet = ccc.useSigner();

  const [config, setConfig] = useState<PartyConfig>(DEFAULT_PARTY_CONFIG);
  const { parties, error: partiesError, loading } = useParties(client, config, wallet);

  const [escrows, setEscrows] = useState<EscrowRecord[]>([]);
  const [listError, setListError] = useState<string>();
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const nextId = useRef(1);

  const refresh = useCallback(async () => {
    try {
      setEscrows(await listEscrows(client));
      setListError(undefined);
    } catch (err) {
      setListError(messageOf(err));
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startEntry = (label: string): number => {
    const id = nextId.current++;
    setLog((prev) => [{ id, label, status: "pending" }, ...prev]);
    return id;
  };

  const updateEntry = (id: number, patch: Partial<LogEntry>) => {
    setLog((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };

  /** Sends, waits for the chain to commit, then re-reads the escrow set. */
  const track = async (id: number, send: () => Promise<ccc.Hex>) => {
    setBusy(true);
    try {
      const txHash = await send();
      updateEntry(id, { txHash, detail: "waiting for commitment…" });
      await client.waitTransaction(txHash);
      updateEntry(id, { status: "committed", detail: undefined });
      await refresh();
    } catch (err) {
      updateEntry(id, { status: "failed", detail: messageOf(err) });
    } finally {
      setBusy(false);
    }
  };

  const handleFund = (amountCkb: string, timeout: bigint) => {
    if (!parties) return;
    const id = startEntry(`Fund ${amountCkb} CKB into escrow`);
    void track(id, () =>
      fundEscrow({
        signer: parties.buyer.signer,
        capacity: ccc.fixedPointFrom(amountCkb),
        terms: {
          buyer: parties.buyer.lockHash,
          seller: parties.seller.lockHash,
          arbiter: parties.arbiter.lockHash,
          timeout,
        },
      }),
    );
  };

  const handleAction = (escrow: EscrowRecord, action: EscrowAction) => {
    if (!parties) return;

    let consenting: Party[];
    let recipient: ccc.Script;
    let initiator: Party;
    let since: bigint | undefined;
    let label: string;

    if (action.kind === "mutual") {
      consenting = [parties.buyer, parties.seller];
      recipient = parties.seller.lock;
      initiator = parties.buyer;
      label = "Mutual release → seller";
    } else if (action.kind === "arbitrated") {
      const favoured = action.favouring === "buyer" ? parties.buyer : parties.seller;
      consenting = [parties.arbiter, favoured];
      recipient = favoured.lock;
      initiator = parties.arbiter;
      label = `Arbitrated release → ${action.favouring}`;
    } else {
      consenting = [parties.buyer];
      recipient = parties.buyer.lock;
      initiator = parties.buyer;
      since = escrow.terms.timeout;
      label = "Timeout refund → buyer";
    }

    const id = startEntry(label);
    void track(id, () =>
      spendEscrow({ client, escrow, parties: consenting, recipient, initiator, since }),
    );
  };

  return (
    <main>
      <header>
        <h1>CKB Escrow</h1>
        <p className="muted">
          A React front end over the Rust escrow lock script, running against a local OffCKB
          devnet.
        </p>
        <dl className="facts">
          <div>
            <dt>RPC</dt>
            <dd>{DEVNET_RPC}</dd>
          </div>
          <div>
            <dt>Escrow code hash</dt>
            <dd>
              <code>{ESCROW_CODE_HASH}</code>
            </dd>
          </div>
          <div>
            <dt>Devnet scripts</dt>
            <dd>{DEVNET_SCRIPT_NAMES.join(", ")}</dd>
          </div>
        </dl>
      </header>

      <PartyPicker
        config={config}
        onChange={setConfig}
        parties={parties}
        walletConnected={Boolean(wallet)}
      />

      {partiesError ? <p className="error">{partiesError}</p> : null}
      {loading ? <p className="muted">Resolving party addresses…</p> : null}

      <CreateEscrow parties={parties} busy={busy} onFund={handleFund} />

      {listError ? <p className="error">Could not read escrows: {listError}</p> : null}
      <EscrowList
        escrows={escrows}
        parties={parties}
        busy={busy}
        onAction={handleAction}
        onRefresh={() => void refresh()}
      />

      <section className="card">
        <h2>Transactions</h2>
        <TxLog entries={log} />
      </section>
    </main>
  );
}
