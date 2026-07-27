export type LogEntry = {
  id: number;
  label: string;
  status: "pending" | "committed" | "failed";
  txHash?: string;
  detail?: string;
};

export function TxLog({ entries }: { entries: LogEntry[] }) {
  if (entries.length === 0) {
    return <p className="muted">No transactions yet.</p>;
  }
  return (
    <ol className="log">
      {entries.map((entry) => (
        <li key={entry.id} className={`log-entry log-${entry.status}`}>
          <div className="log-head">
            <span className="log-label">{entry.label}</span>
            <span className="badge">{entry.status}</span>
          </div>
          {entry.txHash ? <code className="hash">{entry.txHash}</code> : null}
          {entry.detail ? <p className="log-detail">{entry.detail}</p> : null}
        </li>
      ))}
    </ol>
  );
}
