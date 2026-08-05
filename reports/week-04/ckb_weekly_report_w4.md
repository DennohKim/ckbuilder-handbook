## Builder Track Weekly Report — Week 4

**Name:** Dennis Kimathi
**Week Ending:** 08-02-2026

### Courses Completed

- Continued **Rust** on [rarecode.ai](https://rarecode.ai/), working through the collections, iterators and dereferencing modules:
  - **7. Type Casting** — converting between types safely
  - **8. Sets** — unique collections of values
  - **9. Collections Practice** — exercises over sets and vectors
  - **10. Iterators** — `into_iter` and `collect`
  - **11. Tuples** — fixed-size collections of mixed types
  - **12. Options** — Rust's `Option` type
  - **14. HashMaps I** — key-value collections
  - **15. Range and Iterators** — ranges and further iterator patterns
  - **16. Dereference I** — Rust's dereference operations
  - **17. Dereference II** — deeper into dereference
  - **18. Iterator Methods** — iterating through methods
  - **19. Into iter consumption** — how iteration consumes the thing it iterates
  - These landed in the week's script work almost immediately: the UDT type script compares a loaded lock hash against its args with `lock_hash[..] == *owner_lock_hash` (dereference), sums a script group with `checked_add(…).ok_or(…)` (`Option` → `Result`), and the cycle-budget tests build their fixtures with `.iter().copied().map(…).collect()`
- Worked through the **[Fiber Network](https://www.fiber.world/docs)** docs — channels, payments, routing and security — and then ran the thing rather than only reading about it
- Read the **[sUDT standard (RFC-0025)](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0025-simple-udt/0025-simple-udt.md)** and wrote my own implementation of it
- Read the **[fiber-scripts](https://github.com/nervosnetwork/fiber-scripts) `commitment-lock`** source to work out how the force-close delay is actually enforced

### Key Learnings

- **Fiber is the answer to the problem I ended Week 3 stuck on.** Last week I wrote that the escrow's mutual path needs two parties to co-sign and that a real product needs a partially-signed-transaction handoff. A payment channel *is* that handoff, industrialised: the two parties hold a shared funding cell and exchange signed commitment transactions off-chain, so the co-signing I was going to hand-roll is the protocol's inner loop rather than a feature I bolt on
- **The commitment transaction is a real, fully-signed transaction that is deliberately never broadcast.** This was the thing that made the model click. After my payment, node 1 reported `latest_commitment_transaction_hash` `0x65d8904f…`; asking the CKB node for that transaction returns status **`unknown`** — it does not exist on chain and never did. Each party holds a valid transaction that would settle the channel in their favour, and the whole design is about making it irrational to publish an old one. Off-chain scaling is not "a second chain", it is *withheld transactions*
- **Two signatures, one witness.** The cooperative close spends the 2-party funding cell with a **single witness**, not two. Fiber depends on `musig2` (v0.2.4, in `fiber-lib` and `fiber-types`) to aggregate both parties' signatures into one Schnorr signature. My escrow instead proves consent by requiring each party to contribute an input cell whose *own* lock checks their signature — which works, but costs an input per party and leaks who took part. Signature aggregation is the cheaper and more private primitive, and it is the piece my Week 3 design was missing
- **The force-close delay is the same `since` mechanism as my escrow's timeout, in epoch form.** Force-closing put a single 599 CKB cell on chain under the `CommitmentLock`. Its args carry the delay at `args[20..28]` as a `since` value — `0xa000010000000001`, which decodes as **relative, epoch metric, 1 epoch**. The settlement transaction that later spent that cell committed **exactly that same `since` on its input**. This is precisely the Week 2/3 timeout refund: the script compares numbers, and consensus refuses to include the input until the delay has elapsed. Fiber uses the *epoch* metric where I used block numbers, because epochs track wall-clock time far more stably than block height
- **A channel balance is not the same as the funding cell's capacity, because a cell has a floor.** Node 1 funded 500 CKB and node 2 auto-accepted with 99 CKB, giving a 599 CKB funding cell — but node 1's spendable balance showed 401 CKB and node 2's showed 0. The gap is `MIN_RESERVED_CKB` = **99 CKB per side**: a commitment output has to be a *valid cell*, so each party must permanently hold back enough capacity to pay for its own occupancy. Lightning has a dust limit; on CKB the floor falls straight out of the cell model — capacity is simultaneously the money and the storage rent
- **A type script answers a different question than a lock script.** A lock is asked "may this one cell be spent"; a type script is asked "is this whole state transition valid", and it runs once over its **script group** — every input *and* output carrying that exact script. `Source::GroupInput` / `GroupOutput` is what makes a token possible: it lets the script sum both sides of the transaction without hand-filtering unrelated cells. Capacity is conserved by consensus; a token balance is conserved **only because the type script says so**
- **sUDT deliberately permits burning.** The rule is `outputs <= inputs`, not `outputs == inputs`. I had assumed equality and wrote the test that way first; reading RFC-0025 corrected me. Inflation is the attack, destruction is the owner's business
- **Owner mode is just a lock-hash check, exactly like my escrow's consent check.** Minting is allowed when a cell under the owner's lock appears among the inputs — the same trick the escrow uses for buyer/seller presence. I got to reuse a pattern I already understood, which is a good sign the cell model is starting to be intuitive rather than memorised
- **A gotcha that cost me a broken build:** `offckb deploy --target <one-binary>` **rewrites `deployment/scripts.json` wholesale** rather than merging, so deploying the new UDT silently deleted the `escrow` entry that the demo script and the front end both read. The deployed escrow cell was still perfectly alive on chain; only the local record of it was gone. Deployment records are not an append-only log, and anything that reads them needs to survive a partial rewrite

### Practical Progress

- **Ran a real two-node Fiber network on a local dev chain** (`fnn` v0.8.1, `ckb` v0.209.0, `ckb-cli` v2.0.0):
  - Fiber cannot run on my usual OffCKB devnet — `FundingLock`, `CommitmentLock` and `ckb_auth` are baked into the chain's **genesis system cells**, so it needs its own dev chain (`chain_hash` `0xeac93bcf…`)
  - node 1 `02a64b8993f3…` (p2p 8344 / RPC 21714), node 2 `02bcbd0e0d81…` (p2p 8345 / RPC 21715)
- **Full cooperative channel lifecycle, end to end:**
  - channel `0x748ea116eb5191938e6ad0f1ef2c6abb0ebe9ee707e342fe7856422574935bf7`
  - funding tx `0xe61183a1942b6a44255aa829685c2424c5dd4d41ecd850d0f89464bed1ebea69` (**committed**) — 599 CKB into one cell under `FundingLock` `0xf02ae41c…`
  - paid a 1 CKB invoice off-chain (`payment_hash` `0xfc8b6400…`, status **Success**); balances moved 401/0 → 400/1 with **no on-chain transaction**
  - cooperative close `0xa3c68e22e6c129c8a709f2bb0d249c25a9ec0b1af9de8ea4046325bb8867d4be` (**committed**) — one input, two outputs (499 CKB / 100 CKB), **one witness**
- **Force-closed a second channel to see the uncooperative path:**
  - channel `0x503724dac3f0e27eb75d6137196abbc41ab173ffa9db7330d92418ae19abfd85`, 2 CKB paid across it first
  - force close `0xe867d156f0a89ac8bc976bac272ea50bba92c8239f20ea87de32eaa2c34830d8` (**committed**) — 599 CKB into a single `CommitmentLock` cell, channel state `UNCOOPERATIVE_LOCAL|WAITING_ONCHAIN_SETTLEMENT`
  - the node's **watchtower** then settled it automatically: `0xf9ba1f3bcf98971d9fb9fc9136d84db9a2336c86977c868f5754f20a3b8ba945` (**committed**, block 297), whose input commits `since` `0xa000010000000001` — the 1-epoch relative delay from the lock args
  - the watchtower retries every second and logs a noisy `PoolRejectedDuplicatedTransaction` error once its settlement is already in the pool; harmless, but it looks alarming in the logs
- **Wrote a minimal sUDT type script** in `contracts/udt/` — my first type script, and the half of the cell model the escrow never touched:
  - ~110 lines: owner-mode mint escape hatch, then `sum(GroupOutput) <= sum(GroupInput)`, with `checked_add` against overflow and a hard reject for cell data too short to hold a `u128`
  - **7 VM tests**: owner mint, conserving transfer, merge, burn, inflation rejected, mint-without-owner rejected, truncated amount data rejected
  - deployed to the OffCKB devnet — `code_hash` `0x2abe41c98614ff98074eaa9ba40bab9d8f45d73194032a429334e2ac5bd01659` (`data2`), deploy tx `0xc3285ffa2d065c4d9f785d6d8b9633aae4639e850134030bc2c03f9f73779084` (**committed**)
- **Proved the token on the live devnet** with `demo/mint-and-transfer.cjs` (CCC), token type hash `0x96be75bb…`:
  - mint 1,000,000 tokens in owner mode — `0xcd9c9842290f5d78b818cac5a538661a07fad0193bbba3e5e3074fb6c42585de` (**committed**)
  - holder transfers 400,000 on with **no owner involved**, so only the balance rule authorises it — `0x1d530e971c194376255ee4a3ac4f0a4f950a4b62b9a9b3fbe35f5433d9b7d7bd` (**committed**); re-read from chain as 400,000 / 600,000
  - an inflation attempt (600,000 in → 2,000,000 out) was **rejected by consensus**: `Inputs[0].Type … error code 8`, which is my `InflatedSupply`. Seeing my own error code come back from a real node was the most satisfying part of the week
- **Measured cycle costs for the first time** — added a cycle-budget test to both suites plus an opt-in dump for `ckb-debugger`:

  | script | path | cycles |
  |---|---|---|
  | escrow | mutual release | 32,138 |
  | escrow | arbitrated | 32,144 |
  | escrow | timeout refund | 28,481 |
  | udt | owner mint | 24,270 |
  | udt | 1-in 2-out transfer | 27,706 |

  - `ckb-debugger` on the same dumped transactions reports the **lock group alone**: 27,932 / 27,938 / 26,382. The difference is the other script groups in the transaction — consistently ~2,103 cycles per always-success party lock, which is a neat confirmation that `verify_tx` prices the *whole* transaction while the debugger prices one group
  - the escrow always walks every input, so the timeout path is cheaper only because its transaction has one fewer input to walk (one party, not two) — not because it exits early. Owner-mode mint genuinely does exit early, returning before the group is summed at all
- **17/17 tests pass** (8 escrow + 7 UDT + 2 cycle budgets), 1 ignored dump helper; `clippy` clean, `cargo fmt --check` clean

### Environment

- Fiber: `fnn` v0.8.1 (prebuilt `aarch64-darwin`) against its own `ckb_dev` chain — OffCKB's devnet genesis does not carry the Fiber contracts, so the two chains cannot share port 8114 and I swap between them
- `ckb` v0.209.0 and `ckb-cli` v2.0.0 installed for the Fiber dev chain; `ckb-debugger` now in the loop for cycle counting
- `ckb-escrow` workspace now holds two contracts (`escrow`, `udt`); Rust script toolchain unchanged and still working end-to-end: `make build` → `make test` → `offckb deploy` → drive from Node/CCC
- Next step: the **partially-signed transaction handoff** is still unbuilt, but I now know what shape it should be — Fiber's commitment exchange, with `musig2` aggregation instead of one presence input per party. Before that I want to make the escrow **hold my UDT instead of bare CKB**, which forces the lock and the type script to coexist in one transaction and is the natural join of the last three weeks' work.

### Evidence

Raw output for every hash and number above is kept in [`evidence/`](./evidence), along
with the driver scripts and reproduction steps:

- [`01-fiber-cooperative-channel.txt`](./evidence/01-fiber-cooperative-channel.txt) — channel open, off-chain payment, cooperative close
- [`02-fiber-force-close.txt`](./evidence/02-fiber-force-close.txt) — force close and the `CommitmentLock` cell
- [`03-tests-and-cycles.txt`](./evidence/03-tests-and-cycles.txt) — 17/17 tests, cycle counts, clippy/fmt clean
- [`04-devnet-udt-onchain.txt`](./evidence/04-devnet-udt-onchain.txt) — every cited devnet transaction re-queried and confirmed committed, token balances re-read from chain
- [`05-fiber-settlement-onchain.txt`](./evidence/05-fiber-settlement-onchain.txt) — the settlement re-queried, and the `since` delay decoded from the lock args and matched against the input that spent it

---

_TODO before submitting: add terminal screenshots — the two `fnn` nodes running, the channel lifecycle output, and the rejected inflation transaction._
