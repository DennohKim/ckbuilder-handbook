## Builder Track Weekly Report — Week 3

**Name:** Dennis Kimathi
**Week Ending:** 07-26-2026

### Courses Completed

- Continued **Rust** on [rarecode.ai](https://rarecode.ai/):
  - _TODO: list the modules completed this week_
- Worked through the **[CCC](https://github.com/ckb-devrel/ccc)** API while building a front end — transaction construction (`completeInputsByCapacity`, the `completeFee*` family), client/script configuration, and the signer abstraction
- Read **[RFC-0017 — Transaction `since` field](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0017-tx-valid-since/0017-tx-valid-since.md)** properly after last week's escrow used `since` without me fully understanding the flag layout

### Key Learnings

- **A front end has nothing to call.** On EVM I would query a contract's state; here there is no contract account and no balance to read. The app finds live escrows by asking the indexer for cells whose **lock script starts with the escrow code hash** — a prefix search — and then decodes each cell's own `args` to recover its terms. State is the set of cells, so the query is a search over cells, not a call to code
- **The chain enforces the deadline, not my script.** The escrow only compares two numbers; what makes the timeout trustworthy is that **consensus refuses to include an input whose `since` has not elapsed**. My premature-refund test proves this: the transaction is rejected as immature and never reaches the CKB-VM at all
- **`since` layout** — an 8-bit flag prefix over a 56-bit value: bit 63 relative vs absolute, bits 62–61 the metric (block number / epoch / timestamp). The escrow requires the committed flags to match the agreed deadline's exactly, so a relative-block deadline can't be satisfied by an absolute-block `since`
- **A bug the front end forced me to find** — my Week 2 escrow treated `timeout = 0` as "no deadline agreed", but the script's `since_reached()` returned `true` for a zero timeout, which made the refund path **permanently open**: the buyer could unilaterally reclaim the funds at any moment. The Week 2 devnet demo funded with exactly `timeout = 0`, so that 200 CKB escrow was never actually escrowed — the mutual release only worked because the buyer chose to co-operate. None of my seven tests covered a zero timeout, which is exactly why it survived
  - The lesson is about **where a test suite's blind spot lives**: I had tested every unlock path and every rejection I had thought of, but not the *degenerate value of a parameter*. Writing UI that had to explain the timeout field to a user is what surfaced it
- **One wallet is one signature.** The escrow's mutual path needs the buyer and the seller to both contribute a presence input, and a browser wallet signs only for itself. There is no `msg.sender` and no on-chain call to co-ordinate the two — a real product needs a partially-signed-transaction handoff between the parties, the same shape as Bitcoin's PSBT. For a devnet demo I let each role be backed either by a prefunded devnet account or by the connected wallet
- **Cell deps are chain-specific, which decides which wallets can work.** A script's code lives in a cell, so its dep out-point is different on every chain — the devnet regenerates its genesis locally, so CCC's built-in testnet out-points are wrong there. The devnet genesis carries secp256k1, omnilock, ACP, xUDT, TypeId and DAO, so **MetaMask works (it maps to omnilock with ETH auth) while JoyID cannot** — JoyID's lock script simply isn't deployed on my devnet. The app now checks a connected wallet's lock against the devnet's code hashes and says so up front instead of failing later
- **Fees have to come from somebody specific.** My first release transaction let CCC send change to the initiator, which quietly absorbed the other party's returned capacity. Using `completeFeeChangeToOutput` against the initiator's own output means each party gets their presence cell back intact and only the initiator pays

### Practical Progress

- **Found, fixed and re-proved the `timeout = 0` bug** in `contracts/escrow`:
  - Wrote the failing test first (`buyer_alone_with_zero_timeout_fails`), confirmed it reproduced the unilateral drain, then guarded the refund path with `timeout != 0`
  - **8/8 CKB-VM tests pass** (was 7), `clippy` clean
  - **Redeployed to the devnet** — new `code_hash` `0xa141eff3dcbeb404516858c8d1a707b0aad7c2d292dbdbbc47690b516a109c05` (`data2`), deploy tx `0x82e95a4ffbb12fac37e4c20d49c1d0e1b310c3f7ecbc22569cd457046631c195` (**committed**)
  - Repointed the Week 2 demo script at `deployment/scripts.json` instead of a hardcoded hash, and re-ran it end-to-end against the new deployment: fund `0xa372764eafed4c647de0c62b56dec5109ed79dca07cc2b04b0243cd6f58469c2`, release `0xe4ed3db1e40755dea5a506476eaf09d7d503b6255ed93f83a4817e1ebaf1467b` (both **committed**)
- **Built the escrow dApp** in `ckb-escrow/app/` — React + TypeScript + Vite + CCC:
  - Connect a wallet (`@ckb-ccc/connector-react`) or drive any role from a prefunded devnet account
  - Create an escrow (amount + refund deadline in relative blocks), see the live escrow cells, and trigger **mutual release**, **arbitration either way**, or **timeout refund**, with a transaction log that waits for each hash to commit
  - Chain logic is kept React-free in `src/ckb/` so the tests exercise exactly the module the UI uses
  - A `sync` step regenerates the devnet script map and the escrow's deployed code hash before every dev/build/test run, so a redeploy or `offckb clean` can't leave the app pointing at a dead out-point
- **Verified all three unlock paths on the live devnet** through the app's own module (`npm test`, 7/7 passing, real transactions):
  - Mutual release — `0xa7f141c381048c4f8226698f0418bb2156f75ff90439cd61b99ca611cdd1397c` (**committed**)
  - Arbitrated → seller — `0xc2ece210b081448114e8a2cb3344c55e9fe02918077637acb20b8ec27e51b7b3` (**committed**)
  - Arbitrated → buyer — `0x6ef1581d60b695c0404cf791f0e04cdf5e5e45a259836c6be4fcc618132e0225` (**committed**)
  - Timeout refund, buyer alone after a 3-block relative deadline — `0xd7a6a102332698afee34dde7d834a63987ae2f458e169f893b3444cd4f13dd70` (**committed**)
  - Rejections proved on-chain too: a refund before the deadline (rejected as **immature** by consensus), the buyer alone with no deadline set (the Week 2 bug, now rejected by the script), and an unrelated party
  - This closes out the Week 2 next step — the arbitrated and timeout paths had only ever been tested in the VM harness, never on a real chain

### Environment

- `ckb-escrow/app/` — Vite + React 19 + TypeScript, `@ckb-ccc/core` and `@ckb-ccc/connector-react`; `npm run dev`, `npm run build`, `npm test` all working
- Vitest wired for **devnet integration tests** rather than mocks, so a passing run means real committed transactions
- Rust script toolchain unchanged from Week 2 and still working end-to-end: `make build` → `make test` → `offckb deploy` → drive from the browser
- Next step: the front end can only co-sign because it holds both parties' keys. I want to build the **partially-signed transaction handoff** — one party signs and exports the transaction, the other imports and broadcasts — and then start on a **Type Script** (an sUDT-style token) to cover the half of the model the escrow doesn't touch
