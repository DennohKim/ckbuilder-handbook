use ckb_testtool::builtin::ALWAYS_SUCCESS;
use ckb_testtool::ckb_types::{
    bytes::Bytes,
    core::{TransactionBuilder, TransactionView},
    packed::*,
    prelude::*,
};
use ckb_testtool::context::Context;

const MAX_CYCLES: u64 = 100_000_000;

fn u64_le(value: u64) -> Uint64 {
    value.pack()
}

struct Udt {
    context: Context,
    udt_type: Script,
    owner_lock: Script,
    user_lock: Script,
}

fn setup() -> Udt {
    let mut context = Context::default();
    let always = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let udt_code = context.deploy_cell_by_name("udt");

    let party_lock = |context: &mut Context, tag: u8| {
        context
            .build_script(&always, Bytes::from(vec![tag]))
            .expect("party lock")
    };

    let owner_lock = party_lock(&mut context, 1);
    let user_lock = party_lock(&mut context, 2);

    let udt_type = context
        .build_script(
            &udt_code,
            Bytes::from(owner_lock.calc_script_hash().as_slice().to_vec()),
        )
        .expect("udt type");

    Udt {
        context,
        udt_type,
        owner_lock,
        user_lock,
    }
}

fn amount_data(amount: u128) -> Bytes {
    Bytes::from(amount.to_le_bytes().to_vec())
}

/// Build a transaction consuming token cells holding `input_amounts` and
/// producing token cells whose data is `outputs_data`, optionally including a
/// cell locked by the owner to trigger owner mode.
///
/// A plain input under the user lock is always present so that a transaction
/// with no token inputs is still a well-formed transaction. It carries no type
/// script, so it never joins the script group.
fn spend(
    u: &mut Udt,
    input_amounts: &[u128],
    outputs_data: &[Bytes],
    with_owner: bool,
) -> TransactionView {
    let mut inputs = Vec::new();

    let fee_cell = u.context.create_cell(
        CellOutput::new_builder()
            .capacity(u64_le(1000))
            .lock(u.user_lock.clone())
            .build(),
        Bytes::new(),
    );
    inputs.push(CellInput::new_builder().previous_output(fee_cell).build());

    for amount in input_amounts {
        let token_cell = u.context.create_cell(
            CellOutput::new_builder()
                .capacity(u64_le(1000))
                .lock(u.user_lock.clone())
                .type_(Some(u.udt_type.clone()).pack())
                .build(),
            amount_data(*amount),
        );
        inputs.push(CellInput::new_builder().previous_output(token_cell).build());
    }

    if with_owner {
        let owner_cell = u.context.create_cell(
            CellOutput::new_builder()
                .capacity(u64_le(1000))
                .lock(u.owner_lock.clone())
                .build(),
            Bytes::new(),
        );
        inputs.push(CellInput::new_builder().previous_output(owner_cell).build());
    }

    let outputs: Vec<CellOutput> = outputs_data
        .iter()
        .map(|_| {
            CellOutput::new_builder()
                .capacity(u64_le(1000))
                .lock(u.user_lock.clone())
                .type_(Some(u.udt_type.clone()).pack())
                .build()
        })
        .collect();

    let tx = TransactionBuilder::default()
        .inputs(inputs)
        .outputs(outputs)
        .outputs_data(outputs_data.to_vec().pack())
        .build();
    u.context.complete_tx(tx)
}

fn amounts(values: &[u128]) -> Vec<Bytes> {
    values.iter().copied().map(amount_data).collect()
}

#[test]
fn owner_can_mint_from_nothing() {
    // #given the owner is present and no tokens exist yet
    let mut u = setup();
    // #when the owner creates a token cell out of thin air
    let tx = spend(&mut u, &[], &amounts(&[1_000_000]), true);
    // #then owner mode permits the mint
    u.context.verify_tx(&tx, MAX_CYCLES).expect("owner mint");
}

#[test]
fn transfer_conserving_amount_succeeds() {
    // #given a holder splitting 1000 tokens into two cells
    let mut u = setup();
    // #when the totals on both sides match
    let tx = spend(&mut u, &[1000], &amounts(&[400, 600]), false);
    // #then the transfer is valid without the owner
    u.context.verify_tx(&tx, MAX_CYCLES).expect("transfer");
}

#[test]
fn merging_inputs_succeeds() {
    // #given a holder consolidating three token cells
    let mut u = setup();
    // #when the merged output equals the sum of the inputs
    let tx = spend(&mut u, &[100, 250, 650], &amounts(&[1000]), false);
    // #then the merge is valid
    u.context.verify_tx(&tx, MAX_CYCLES).expect("merge");
}

#[test]
fn burning_succeeds() {
    // #given a holder destroying part of their balance
    let mut u = setup();
    // #when the outputs total less than the inputs
    let tx = spend(&mut u, &[1000], &amounts(&[400]), false);
    // #then sUDT permits the burn — only inflation is forbidden
    u.context.verify_tx(&tx, MAX_CYCLES).expect("burn");
}

#[test]
fn inflating_without_owner_fails() {
    // #given a holder of 100 tokens who is not the owner
    let mut u = setup();
    // #when they try to produce 200 tokens
    let tx = spend(&mut u, &[100], &amounts(&[200]), false);
    // #then the type script rejects the transition
    assert!(u.context.verify_tx(&tx, MAX_CYCLES).is_err());
}

#[test]
fn minting_without_owner_fails() {
    // #given no token inputs and no owner present
    let mut u = setup();
    // #when a stranger tries to conjure tokens
    let tx = spend(&mut u, &[], &amounts(&[500]), false);
    // #then the type script rejects the mint
    assert!(u.context.verify_tx(&tx, MAX_CYCLES).is_err());
}

/// Owner mode short-circuits before the group is summed, so a mint should be
/// measurably cheaper than a transfer. Both are pinned so that a future change
/// which starts scanning the whole transaction shows up here.
#[test]
fn valid_paths_stay_within_cycle_budget() {
    const BUDGET: u64 = 2_000_000;

    let mut u = setup();
    let mint = spend(&mut u, &[], &amounts(&[1_000_000]), true);
    let mint_cycles = u.context.verify_tx(&mint, MAX_CYCLES).expect("mint");

    let mut u = setup();
    let transfer = spend(&mut u, &[1000], &amounts(&[400, 600]), false);
    let transfer_cycles = u
        .context
        .verify_tx(&transfer, MAX_CYCLES)
        .expect("transfer");

    println!("udt cycles — owner mint: {mint_cycles}");
    println!("udt cycles — 1-in 2-out transfer: {transfer_cycles}");
    assert!(mint_cycles < BUDGET);
    assert!(transfer_cycles < BUDGET);
}

#[test]
fn amount_data_shorter_than_16_bytes_fails() {
    // #given an output cell whose data cannot hold a u128 amount
    let mut u = setup();
    let truncated = Bytes::from(vec![0u8; 8]);
    // #when it is offered as a token cell
    let tx = spend(&mut u, &[1000], &[truncated], false);
    // #then the type script rejects it rather than reading past the end
    assert!(u.context.verify_tx(&tx, MAX_CYCLES).is_err());
}
