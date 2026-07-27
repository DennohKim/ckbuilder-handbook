import { useEffect, useState } from "react";
import { ccc } from "@ckb-ccc/connector-react";
import { DEV_ACCOUNTS } from "../ckb/accounts";
import { isLockSupportedOnDevnet } from "../ckb/client";
import type { Party, Role } from "../ckb/escrow";

export const ROLES: Role[] = ["buyer", "seller", "arbiter"];

export type SignerSource = { kind: "dev"; index: number } | { kind: "wallet" };

export type PartyConfig = Record<Role, SignerSource>;

export const DEFAULT_PARTY_CONFIG: PartyConfig = {
  buyer: { kind: "dev", index: 0 },
  seller: { kind: "dev", index: 1 },
  arbiter: { kind: "dev", index: 2 },
};

export type ResolvedParty = Party & {
  source: SignerSource;
  address: string;
  lockHash: ccc.Hex;
};

export type PartiesState = {
  parties?: Record<Role, ResolvedParty>;
  error?: string;
  loading: boolean;
};

function signerFor(
  client: ccc.Client,
  source: SignerSource,
  wallet: ccc.Signer | undefined,
): ccc.Signer {
  if (source.kind === "wallet") {
    if (!wallet) throw new Error("no wallet connected");
    return wallet;
  }
  const account = DEV_ACCOUNTS.find((a) => a.index === source.index);
  if (!account) throw new Error(`unknown dev account #${source.index}`);
  return new ccc.SignerCkbPrivateKey(client, account.privateKey);
}

export function useParties(
  client: ccc.Client,
  config: PartyConfig,
  wallet: ccc.Signer | undefined,
): PartiesState {
  const [state, setState] = useState<PartiesState>({ loading: true });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true });

    (async () => {
      const resolved = {} as Record<Role, ResolvedParty>;
      for (const role of ROLES) {
        const source = config[role];
        const signer = signerFor(client, source, wallet);
        const address = await signer.getRecommendedAddressObj();
        if (!isLockSupportedOnDevnet(address.script)) {
          throw new Error(
            `the ${role}'s lock (code hash ${address.script.codeHash.slice(0, 10)}…) is not deployed on this devnet, so its cells can never be spent here`,
          );
        }
        resolved[role] = {
          role,
          source,
          signer,
          lock: address.script,
          lockHash: address.script.hash(),
          address: address.toString(),
        };
      }
      if (!cancelled) setState({ parties: resolved, loading: false });
    })().catch((err: unknown) => {
      if (!cancelled) {
        setState({ error: err instanceof Error ? err.message : String(err), loading: false });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [client, config, wallet]);

  return state;
}
