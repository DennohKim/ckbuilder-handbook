## Builder Track Weekly Report — Week 1

**Name:** Dennis Kimathi
**Week Ending:** 07-12-2026

### Courses Completed

- Completed the first **two courses** of the [CKB Academy](https://academy.ckb.dev/):
  - **[Basic Theory](https://academy.ckb.dev/courses/basic-theory)** — CKB's conceptual foundations:
    - The **Cell Model** and the structure of a Cell (capacity, lock, type, data)
    - Structure of a **transaction** (inputs, outputs, witnesses, cell deps)
    - **Scripts** (Lock vs. Type) and the **CKB-VM**
  - **[Basic Operation](https://academy.ckb.dev/courses/basic-operation)** — hands-on account and transaction flow:
    - Generated an account/address, funded it from the **testnet faucet**, checked balance
    - Walked through building and sending a **CKB transfer**
- Read the official docs **[How CKB Works](https://docs.nervos.org/docs/getting-started/how-ckb-works)** to cross-check the Academy against the source of truth
- Began **Rust** via [rarecode.ai](https://rarecode.ai/) to prepare for the Rust SDK and on-chain Script work

### Key Learnings

- Developed a solid understanding of CKB's **UTXO-like Cell Model** (state = the set of live Cells), including:
  - How state changes by **consuming live Cells and creating new ones** — nothing is edited in place
  - The roles of **Lock Scripts** (ownership / who can spend) vs. **Type Scripts** (state-transition rules)
  - **CKBytes as storage capacity**: ~61 CKB minimum per basic Cell; holding data means locking up capacity (state rent by lockup)
  - The **CKB-VM** as a real **RISC-V** machine running Script binaries, metered in **cycles** (0 = pass, non-zero = fail)
- **Coming from EVM — UTXO/Cell model vs. account model:**
  - **Ethereum uses an account model** — every account has a balance/storage that contracts **mutate in place** (`balance -= x`); state is one big global, mutable map
  - **CKB uses a UTXO-like Cell model** — there are no balances to edit. Your "balance" is a set of **live Cells** you own; a transfer **consumes** input Cells and **creates** new output Cells (recipient + change), just like Bitcoin UTXOs
  - Consequences of the model: transactions are **explicit about inputs/outputs**, Cells are independent so validation is **parallel-friendly**, and there's **no shared mutable state → no reentrancy**
- **Other EVM → CKB differences that reframed my thinking:**
  - CKB is a **verification model** (I compute the new state off-chain; Scripts only validate it) vs. EVM's **computation model** (the chain runs code to compute state)
  - **No accounts / no `msg.sender`** — ownership is "can you satisfy this Lock Script?"
  - **No runtime cross-contract calls** — composition happens by constructing transactions that reference multiple Cells/Scripts
  - Storage is **priced** via locked capacity instead of being effectively free forever (no state bloat), and **reentrancy doesn't exist**
- Started **Rust** fundamentals (variables/mutability, functions, basic data types) to work toward writing Scripts with `ckb-std`

### Practical Progress

- **Ran a CKB node with Docker** ([guide](https://docs.nervos.org/docs/node/run-node-docker)) — initialized with a persistent volume at `/var/lib/ckb`, edited config, and watched it sync
- **Sent a real transaction with `ckb-cli`** on a local **OffCKB devnet**, following the [Developer Training Course](https://nervos.gitbook.io/developer-training-course/transactions/sending-a-transaction):
  - Started the devnet (`offckb node`) and transferred **1000 CKB** between prefunded accounts via `ckb-cli wallet transfer`
  - Tx hash: `0x901d8a96f096c9f1091e7de58d66c51d9ad976b9cc65c3ef5b68846ae956c197` (status: **committed**, block `0x918455691bcdb131de63015aee2c3e78dfb3b50438bcc78064d158174c30ee64`)
- Began working through **Rust exercises** on rarecode.ai as a foundation for on-chain development

### Environment

- CKB node running in **Docker** (persistent volume, config editable on host)
- **OffCKB** local devnet + **`ckb-cli`** working (used to send the transaction above)
- **Rust + Cargo** installed; started Rust coursework
- `my-first-ckb-project/` scaffolded in the handbook repo for upcoming hands-on work
