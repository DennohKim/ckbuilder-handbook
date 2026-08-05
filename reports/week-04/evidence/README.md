# Week 4 — evidence

Raw output from the runs the report is based on, kept so the hashes and numbers
in `../ckb_weekly_report_w4.md` can be checked rather than taken on trust.

| File | What it shows |
|---|---|
| `01-fiber-cooperative-channel.txt` | Two Fiber nodes, channel open, off-chain payment, cooperative close |
| `02-fiber-force-close.txt` | Second channel force-closed, `CommitmentLock` cell on chain |
| `03-tests-and-cycles.txt` | 17/17 tests, cycle counts from CKB-VM and from `ckb-debugger`, clippy/fmt clean |
| `04-devnet-udt-onchain.txt` | Every devnet transaction cited in the report, re-queried and confirmed committed; token identity recomputed from the on-chain cell |
| `05-fiber-settlement-onchain.txt` | Force close and watchtower settlement re-queried; the `since` delay decoded from the `CommitmentLock` args and matched against the settlement input |
| `fiber-run.sh` / `fiber-force.sh` | The drivers that produced files 01 and 02 |

## Reproducing the Fiber runs

Fiber cannot use the OffCKB devnet — `FundingLock`, `CommitmentLock` and
`ckb_auth` are genesis system cells on a chain Fiber builds itself, so the two
chains cannot both hold port 8114. Stop OffCKB first.

```bash
# binaries: fnn v0.8.1 (prebuilt), ckb v0.209.0, ckb-cli v2.0.0 on PATH
git clone https://github.com/nervosnetwork/fiber.git && cd fiber
git checkout v0.8.1                      # match the fnn binary
./tests/deploy/init-dev-chain.sh -f      # genesis + funded nodes + generated config.yml
ckb run -C tests/deploy/node-data --indexer &

cd tests/nodes
FIBER_SECRET_KEY_PASSWORD=password1 fnn -d 1 &   # RPC 21714, p2p 8344
FIBER_SECRET_KEY_PASSWORD=password2 fnn -d 2 &   # RPC 21715, p2p 8345

./fiber-run.sh      # cooperative lifecycle
./fiber-force.sh    # force close
```

The dev chain does not mine on its own; both scripts drive `generate_block` /
`generate_epochs` themselves to advance it.

## Reproducing the script work

```bash
cd ckb-escrow
make build && cargo test                 # 17 passed, 1 ignored

# cycle counts
cargo test --package tests -- --nocapture --test-threads=1 | grep 'cycles —'

# same transactions under ckb-debugger
cargo test --package tests dump_unlock_paths -- --ignored
ckb-debugger --tx-file target/debug-txs/mutual-release.json \
  --cell-index 0 --cell-type input --script-group-type lock
```

## Reproducing the on-chain token run

Note that re-running the demo mints a **new** token and produces new hashes; the
ones in the report come from the run recorded in `04-devnet-udt-onchain.txt`.

```bash
offckb node &
offckb deploy --target build/release/udt -y   # see caveat below
cd demo && node mint-and-transfer.cjs
```

**Caveat:** `offckb deploy --target <single-binary>` rewrites
`deployment/scripts.json` wholesale instead of merging, which drops the entries
for every other contract. After deploying one script, check that `escrow` is
still present — the front end and `demo/fund-and-release.cjs` both read it.
