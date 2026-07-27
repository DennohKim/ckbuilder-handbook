# Escrow dApp — React + CCC on the OffCKB devnet

A browser front end over the Rust escrow lock script in `../contracts/escrow`.
It funds escrow cells, lists the live ones, and drives all three unlock paths
(mutual settlement, arbitration, timeout refund) against a local devnet using
[CCC](https://github.com/ckb-devrel/ccc).

## Run

```bash
# 1. devnet, from any directory
offckb node

# 2. deploy the script (from ../), if it isn't already
make build && offckb deploy --network devnet --target build/release -y

# 3. this app
npm install
npm run dev        # http://localhost:5173
```

`npm run dev`, `npm run build` and `npm test` all run `npm run sync` first,
which regenerates two files under `src/ckb/`:

| File | Source | Why it can't be hardcoded |
| --- | --- | --- |
| `devnet-known-scripts.json` | `offckb system-scripts --export-style ccc` | System scripts live in the genesis block, so their out-points change every time the chain is recreated (`offckb clean`). |
| `escrow-script.json` | `../deployment/scripts.json` | The escrow's code hash changes on every redeploy. |

## Signing

The escrow releases when two parties both consent, and a party consents by
contributing one of its own cells as an input. A browser wallet only ever
produces one signature, so the app lets each role be backed by either:

- **an OffCKB devnet account** — prefunded, published test keys, so the whole
  flow can be exercised in one browser; or
- **the connected wallet** — it signs for its own role.

Wallets whose lock script is not deployed on the devnet are rejected up front
with an explanation rather than failing later: the devnet genesis carries
secp256k1, omnilock, ACP, xUDT, TypeId and DAO, so MetaMask (omnilock, ETH
auth) works while JoyID does not.

> The private keys in `src/ckb/accounts.ts` are OffCKB's published devnet
> accounts. They are worthless anywhere else, and the app only ever talks to
> `127.0.0.1:8114`.

## Tests

```bash
npm test     # requires a running devnet with the escrow deployed
```

`tests/escrow.devnet.test.ts` exercises the same `src/ckb/escrow.ts` module the
UI uses, sending real transactions: the three unlock paths, plus rejections for
a premature refund, a lone buyer with no deadline set, and an unrelated party.

## Layout

```
src/ckb/        chain logic, no React — client config, since encoding, escrow txs
src/hooks/      resolves each role to a signer + address
src/components/ party picker, create form, escrow list, transaction log
tests/          devnet integration tests
```
