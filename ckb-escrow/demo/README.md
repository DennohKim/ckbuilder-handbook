# Escrow demo — fund → release on devnet

Drives the deployed escrow script end-to-end against a running OffCKB devnet
using [`@ckb-ccc/core`]:

1. **Fund** — the buyer locks 200 CKB into an escrow cell whose lock is the
   deployed escrow script, with args
   `buyer_lock_hash ‖ seller_lock_hash ‖ arbiter_lock_hash ‖ timeout(0)`.
2. **Release (mutual path)** — a transaction spends the escrow cell alongside a
   buyer input and a seller input (proving both consent). The escrow script runs
   on-chain, sees both party lock hashes present, and permits the spend; the
   200 CKB goes to the seller.

The three parties are OffCKB prefunded accounts #0 (buyer), #1 (seller),
#2 (arbiter). The client overrides ccc's testnet secp256k1 dep group with the
OffCKB devnet genesis out-point.

## Run

```bash
# from the repo root, with the devnet already running (`offckb node`)
# and the escrow deployed (`offckb deploy ...`):
cd demo
npm install
node fund-and-release.cjs
```

It prints the fund and release transaction hashes; both should reach
`committed`, and the escrow cell out-point becomes unspendable once released.

[`@ckb-ccc/core`]: https://github.com/ckb-devrel/ccc
