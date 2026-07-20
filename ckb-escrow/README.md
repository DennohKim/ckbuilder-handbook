# ckb-escrow

A CKB **lock script** that holds funds in escrow between a buyer and a seller,
with an arbiter for disputes and a timeout refund. Written in Rust with
[`ckb-std`], built and tested against the CKB-VM via [`ckb-testtool`].

## How escrow works on CKB

There is no contract account that accumulates a balance. The escrow **is a
cell** — its capacity holds the funds, and its lock script is this program. The
script's only job is to decide *under what conditions that cell may be spent*.

Consent is proven by **presence**: each party is identified by their lock hash,
and a party "signs" by including one of their own cells as an input in the
spending transaction. That input's own lock script already verifies the party's
signature, so this script never reimplements signature checking — it only reads
which party lock hashes appear among the inputs.

## Script args

```
buyer_lock_hash (32) ‖ seller_lock_hash (32) ‖ arbiter_lock_hash (32) ‖ timeout (8, little-endian `since`)
```

`timeout` is a CKB [`since`] value (an absolute block height, epoch, or
timestamp, distinguished by its flag byte). A `timeout` of `0` disables the
timeout path.

## Unlock paths

| Path | Condition | Meaning |
|------|-----------|---------|
| Mutual settlement | buyer **and** seller inputs present | both agree; funds go wherever the tx directs |
| Arbitrated | arbiter **and** (buyer **or** seller) inputs present | arbiter breaks a dispute |
| Timeout refund | buyer input present **and** every escrow input commits `since ≥ timeout` | buyer reclaims a stalled deal |

Any other combination fails with `Unauthorized`. The timeout path is safe
because CKB consensus refuses to mine a transaction until each input's `since`
condition has actually elapsed, so a committed `since ≥ timeout` proves the
deadline has passed.

## Build & test

```bash
make build          # compile the script to build/release/escrow
make test           # run the CKB-VM integration tests
make clippy         # lint
```

The tests in [`tests/src/tests.rs`](tests/src/tests.rs) cover every unlock path
plus the rejection cases (buyer alone before the timeout, arbiter alone, an
unrelated party).

## Layout

- `contracts/escrow/src/main.rs` — the escrow lock script
- `tests/src/tests.rs` — CKB-VM integration tests

*Bootstrapped with [ckb-script-templates].*

[ckb-script-templates]: https://github.com/cryptape/ckb-script-templates
[`ckb-std`]: https://docs.rs/ckb-std
[`ckb-testtool`]: https://docs.rs/ckb-testtool
[`since`]: https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0017-tx-valid-since/0017-tx-valid-since.md
