import { ccc } from "@ckb-ccc/core";
import devnetScripts from "./devnet-known-scripts.json";

export const DEVNET_RPC = "http://127.0.0.1:8114";

type ScriptMap = Record<ccc.KnownScript, ccc.ScriptInfoLike | undefined>;

/**
 * Script code lives in cells, so a script's cell dep out-point is specific to
 * the chain it was deployed on. ccc ships out-points for the public networks;
 * on a devnet the genesis is regenerated locally, so those are wrong. Start
 * from the testnet map — it keeps every lock type resolvable for address
 * parsing — and override the entries the devnet genesis actually provides.
 */
export function createDevnetClient(): ccc.Client {
  const testnetDefaults = new ccc.ClientPublicTestnet().scripts;
  return new ccc.ClientPublicTestnet({
    url: DEVNET_RPC,
    scripts: { ...testnetDefaults, ...(devnetScripts as Partial<ScriptMap>) } as ScriptMap,
  });
}

/** Code hashes the devnet genesis actually carries. */
export const DEVNET_CODE_HASHES: ReadonlySet<string> = new Set(
  Object.values(devnetScripts as Record<string, { codeHash: string }>).map((s) =>
    s.codeHash.toLowerCase(),
  ),
);

export const DEVNET_SCRIPT_NAMES: ReadonlyArray<string> = Object.keys(devnetScripts);

/**
 * A wallet can hand back an address whose lock script was never deployed here
 * (JoyID is the common case — its lock is on testnet/mainnet but not in the
 * offckb genesis). Such an address can hold cells but can never spend them on
 * this chain, so it is worth catching before a transaction is built.
 */
export function isLockSupportedOnDevnet(lock: ccc.Script): boolean {
  return DEVNET_CODE_HASHES.has(lock.codeHash.toLowerCase());
}
