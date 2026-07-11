# CKBuilder Handbook — Dev Log

**Builder:** Dennis Kimathi
**Programme:** Community Keeps Building (CKB) — Builders' Track
**Duration:** 3 months
**Commitment:** ~4–5 hours/week (evenings/weekends), steady pace

This repository is my personal CKBuilder dev log. It records my learning and progress building on [Nervos CKB](https://www.nervos.org/) throughout the programme. Weekly reports live in [`reports/`](./reports).

> Note: Older docs may reference **Lumos** or **Capsule** — these are deprecated. The current recommended tooling is listed below (OffCKB, CCC, Rust SDK).

---

## Reporting Standards

Reimbursement is pro-rata and tied directly to this log. Reports must be:

- **Weekly** — pick a day, submit every week on that day.
- **Contemporaneous** — each report covers the week just completed. Batching multiple weeks into one submission counts as a single report.
- **Published on GitHub** in this personal repository.
- **Accurate** — share what I learned, what was interesting or challenging, and what's next. Include screenshots and evidence. AI may tidy writing, but reports are not AI-generated.

> For every tutorial and exercise, retain **screenshots** as proof of participation and completion.

---

## Learning Path

### 1. Introduction (fundamentals)
- Core technical concepts and terminology of Nervos CKB
- **Getting started / Quick start** — set up the dev environment with **OffCKB** (networks & RPCs)
- **CKB Academy** lessons 1 & 2 (theory)
- **Introduction to Script** — smart contracts on CKB
- Community manuals: *Learning CKB* (24 lessons / 5 phases, by Jnr.bit), *Learn CKB in 45 mins* (by truthixify)

### 2. Beginner (hands-on exercises)
- Transfer CKB
- Store Data on a Cell
- Create a Fungible Token
- Create a DOB (Digital Object)
- Build a Simple Lock

**Tooling — CCC (Common Chain Connector):** beginner-friendly all-in-one JS/TS tool with wallet support.
- CCC App · CCC Playground · Code examples · API

**For intensive smart-contract work → learn Rust** (efficiency, security, strong CKB tooling):
- Rust SDK · CKB-CLI
- Other languages: Go, Java

**Devtools:** Testnet faucet · CKB Debugger · CKB Tools website

**Payment channels** (scaling / high-throughput on L2):
- **Fiber Network** — Lightning-compatible p2p payment/swap network
- **Perun** — Ethereum-compatible p2p payment channels

**Milestone task:** build a basic application (e.g. token generator, spore/DOB minting, or payment processing). Discuss ideas with the programme director (Neon) and CKB DevRel. Good ideas may open funding via the **Spark** programme or **CKB Community Fund DAO**.

### 3. Intermediate
- **Script development course** (10 classes): Validation Model → Script Basics → UDT → WebAssembly → Debugging → Type ID → Duktape examples → Performant WASM → Cycle reductions → Language choices
- Detailed Rust & JS scripting · Ecosystem scripts/libraries
- **Molecule** & serialization
- **sUDT** — basic fungible token standard (≈ ERC-20/ERC-777)
- **Nervos DAO** — lock CKBytes for secondary-issuance compensation (staking-like inflation hedge)
- **Spore (DOBs)** — on-chain digital objects with tokenomics-backed value

### 4. Advanced
- **SSRI** (Script-Sourced Rich Information) — binds logic/info directly to a Script; ref: Pausable UDT (audited, production-ready)
- **RGB++** — Bitcoin asset-issuance protocol leveraging CKB programmability; trustless dApp interaction with native BTC transactions
- **xUDT** — extensible UDT standard; custom validation via external scripts for advanced governance/minting
- **iCKB** — tokenizes Nervos DAO deposits into a liquid iCKB token (solves DAO illiquidity)

---

## Further Reading — Understanding CKB
- Nervos Nation videos: UTXO/PoW, RISC-V, Cell Model, RGB++
- Nervos: In-Depth Overview (modularity) · CKB Ethos · Tokenomics deep dive
- Accounts-free onboarding · A Blockchain Developer's Dream
- Bitcoin vs. CKB (sustainable security) · Web5: Extra Decentralized
- Comparing VMs: EVM, WASM, SVM, CKB-VM
- [nervosnetwork/rfcs](https://github.com/nervosnetwork/rfcs) — proposals, standards, docs

---

## Resources & Support
- **CKB AI scholarship** — access to subscription-grade AI models (shared resource; use responsibly). Connect to **CKB AI MCP** for better dev context.
- Questions → programme director (**Neon**) or CKB DevRel.

---

## This Repo
- [`my-first-ckb-project/`](./my-first-ckb-project) — first hands-on project (contracts, scripts, tests)
- [`reports/`](./reports) — weekly dev-log reports
