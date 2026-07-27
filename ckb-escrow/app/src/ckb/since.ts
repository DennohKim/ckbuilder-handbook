/**
 * `since` (RFC-0017) is a u64 an input commits to: an 8-bit flag prefix over a
 * 56-bit value. Consensus refuses to include the transaction until the value
 * has elapsed, which is what makes the escrow's timeout path trustworthy — the
 * script only compares numbers, the chain does the waiting.
 */
export const SINCE_VALUE_MASK = (1n << 56n) - 1n;

const RELATIVE_FLAG = 1n << 63n;

export type SinceMetric = "block" | "epoch" | "timestamp";

const METRIC_FLAG: Record<SinceMetric, bigint> = {
  block: 0n << 61n,
  epoch: 1n << 61n,
  timestamp: 2n << 61n,
};

export function encodeSince(opts: {
  relative: boolean;
  metric: SinceMetric;
  value: bigint;
}): bigint {
  if (opts.value < 0n || opts.value > SINCE_VALUE_MASK) {
    throw new Error("since value does not fit in 56 bits");
  }
  return (opts.relative ? RELATIVE_FLAG : 0n) | METRIC_FLAG[opts.metric] | opts.value;
}

export function decodeSince(since: bigint): {
  relative: boolean;
  metric: SinceMetric;
  value: bigint;
} {
  const metricBits = (since >> 61n) & 0b11n;
  const metric: SinceMetric =
    metricBits === 1n ? "epoch" : metricBits === 2n ? "timestamp" : "block";
  return {
    relative: (since & RELATIVE_FLAG) !== 0n,
    metric,
    value: since & SINCE_VALUE_MASK,
  };
}

export function describeSince(since: bigint): string {
  if (since === 0n) return "none (refund path disabled)";
  const { relative, metric, value } = decodeSince(since);
  const unit = metric === "block" ? "block" : metric === "epoch" ? "epoch" : "second";
  const plural = value === 1n ? "" : "s";
  return relative
    ? `${value} ${unit}${plural} after funding`
    : `${metric} ${value} (absolute)`;
}
