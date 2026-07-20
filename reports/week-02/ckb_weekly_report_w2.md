## Builder Track Weekly Report — Week 2

**Name:** Dennis Kimathi
**Week Ending:** 07-19-2026

### Courses Completed

- Studied the official docs' **Script section** as an introduction to on-chain programs:
  - **[Intro to Script](https://docs.nervos.org/docs/script/intro-to-script)** — what a Script is, its structure, and how it executes on-chain
  - **[Rust Script API Introduction](https://docs.nervos.org/docs/script/rust/rust-api-introduction)** — the `ckb-std` crate and the APIs available when writing Scripts in Rust
- Continued **Rust** on [rarecode.ai](https://rarecode.ai/), completing the core-language modules:
  - **Ownership & borrowing** — move semantics, references, and the borrow checker
  - **Structs & enums** — methods, `Option`/`Result`
  - **Pattern matching & control flow** — `match`, `if let`, error propagation with `?`
  - **Collections & strings** — `Vec`, `String`/`&str`, `HashMap`, iteration

### Key Learnings

- **What a Script actually is:** a binary executable run on-chain by the **CKB-VM** (RISC-V). Exit code `0` = valid, any non-zero = the transaction is rejected. "Smart contracts" on CKB are just these validators
- **Script structure** — three fields define a Script instance:
  - `code_hash` + `hash_type` — together locate the executable (by data hash or type hash)
  - `args` — per-instance parameters, so many users share one binary (e.g. the same lock code with different public key hashes in `args`)
- **Execution rules that surprised me:**
  - **Lock Scripts on inputs execute; lock Scripts on outputs do not** — you prove you can spend what you consume, while the recipient's lock is only checked when *they* later spend
  - **Type Scripts execute on both inputs and outputs** — which is what makes them suitable for enforcing state-transition rules (mint/burn/transfer invariants)
  - All Scripts in a transaction must pass, metered in **cycles**
- **Why `ckb-std` exists:** Scripts run **bare-metal** — no OS, no allocator, no I/O. `ckb-std` fills the gap for Rust with:
  - `entry!` (program entry point) and `default_alloc!` (global allocator for `no_std`)
  - a **`syscalls`** module (RFC-0009) for reading transaction data from inside the VM, plus a friendlier **`high_level`** API (e.g. loading the current script, iterating cells)
  - `debug!` logging, error types, and a **`native-simulator`** for testing Scripts off-chain
  - advanced primitives: **dynamic loading** (RFC-0034) and **spawn** for inter-process communication (RFC-0050)
- **Connecting the two tracks:** Rust's ownership model maps well to `no_std` Script constraints — no GC, explicit allocation, `Result`-based error handling is exactly the shape of `ckb-std`'s `high_level` API

### Practical Progress

- **Built and tested my first Script** in `my-first-ckb-project/` (`contracts/hello-world`):
  - Wrote the Script against **ckb-js-vm** (TypeScript → compiled to `dist/hello-world.bc` bytecode) — it loads its own Script via `bindings.loadScript()`, logs it, and returns `0`
  - **Unit-tested it with `ckb-testtool`**: constructed a mock transaction that deploys the ckb-js-vm cell + the contract cell, wires the contract's `code_hash`/`hash_type` into the vm's `args`, adds 1 input and 2 output cells, and verifies the Script passes (`verifier.verifySuccess`)
  - Ran the **devnet test** against a local **OffCKB** node to exercise the same Script end-to-end
  - Building the mock transaction by hand reinforced the Week 1 theory: cell deps for code, `args` for wiring, explicit inputs/outputs
- **Wrote my first real Rust + `ckb-std` Script** — an escrow lock in a new `ckb-escrow/` project (scaffolded with **`ckb-script-templates`**):
  - The escrow **is a cell**: its capacity holds the funds, and the lock Script decides when that cell may be spent — no contract "balance", which is the Cell-model reframe from Week 1 made concrete
  - Design is a **2-of-3 with timeout** (buyer / seller / arbiter), using **unlock-by-presence**: each party consents by including one of their own cells as an input, so the escrow only checks which party lock hashes appear — signature verification is offloaded to those inputs' own locks instead of reimplementing secp256k1
  - `args` layout: `buyer_hash(32) ‖ seller_hash(32) ‖ arbiter_hash(32) ‖ timeout(8, a `since` value)`; unlock paths are **mutual settlement**, **arbitrated**, and **timeout refund** (buyer alone once the escrow input's `since ≥ timeout`)
  - Hands-on with the `ckb-std` `high_level` API the docs cover: `load_script`, `load_script_hash`, `load_cell_lock_hash`, `load_input_since`, `Source::Input`
  - **Compiles to a RISC-V binary and passes 7 CKB-VM tests** (`ckb-testtool`): all three unlock paths plus rejection cases (buyer before timeout, arbiter alone, unrelated party). `clippy` clean
  - **Deployed the compiled Script to the OffCKB devnet** (`offckb deploy`) — code cell confirmed **live** on-chain:
    - Deploy tx: `0x3a2e810a7fdee0d4fe9ec440d616ee91af6ae8dc5e9fbc4b76ec0adba7002497` (status: **committed**)
    - `code_hash`: `0x81d2fee6790006229e1d7b7f2f7302c12d55b48803fa132b42922078541d6b76`, `hash_type`: `data2`
  - **Drove a real fund → release cycle against the live devnet** (a `@ckb-ccc/core` script in `ckb-escrow/demo/`, using OffCKB accounts as buyer/seller/arbiter):
    - **Fund** — buyer locked 200 CKB into an escrow cell. Tx: `0x516ca2573c9188bf10131ee8e207ee108f7e31576662990245a5fdddea004a0c` (**committed**)
    - **Release (mutual path)** — a transaction spent the escrow cell with buyer + seller presence inputs; the deployed Script ran on-chain, saw both parties, and released the 200 CKB to the seller. Tx: `0xc7407dec785765e624780f6cec0129377fc266d17eef95518e058695b06ee868` (**committed**, escrow cell now consumed)
    - This closed the loop from Week 1 theory → a Script executing on a real chain and gating a real transfer

### Environment

- `my-first-ckb-project/` now builds (`npm run build`) and tests (`npm test`) the hello-world Script via esbuild + jest
- **OffCKB** devnet + deploy script (`npm run deploy`) working for local iteration
- **Rust script toolchain fully set up**: `ckb-script-templates` + `cargo-generate`, the `riscv64imac-unknown-none-elf` target, and `ckb-debugger`; `ckb-escrow/` builds (`make build`), tests (`make test`), deploys (`offckb deploy`), and drives on-chain transactions (`@ckb-ccc/core`) end-to-end
- Next step: extend the escrow demo to exercise the **arbitrated** and **timeout refund** paths on devnet, and start porting the hello-world Script to Rust
