use ckb_testtool::builtin::ALWAYS_SUCCESS;
use ckb_testtool::ckb_types::{
    bytes::Bytes,
    core::{TransactionBuilder, TransactionView},
    packed::*,
    prelude::*,
};
use ckb_testtool::context::Context;

const MAX_CYCLES: u64 = 100_000_000;

// Absolute block number `since` values share a zero flag prefix, so the raw
// number is directly comparable. The deadline is an absolute block height.
const TIMEOUT: u64 = 200;
const BEFORE_TIMEOUT: u64 = 100;

fn u64_le(value: u64) -> Uint64 {
    value.pack()
}

struct Escrow {
    context: Context,
    escrow_lock: Script,
    buyer_lock: Script,
    seller_lock: Script,
    arbiter_lock: Script,
    stranger_lock: Script,
}

fn setup(timeout: u64) -> Escrow {
    let mut context = Context::default();
    let always = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let escrow_code = context.deploy_cell_by_name("escrow");

    let party_lock = |context: &mut Context, tag: u8| {
        context
            .build_script(&always, Bytes::from(vec![tag]))
            .expect("party lock")
    };

    let buyer_lock = party_lock(&mut context, 1);
    let seller_lock = party_lock(&mut context, 2);
    let arbiter_lock = party_lock(&mut context, 3);
    let stranger_lock = party_lock(&mut context, 9);

    let mut args = Vec::with_capacity(104);
    args.extend_from_slice(buyer_lock.calc_script_hash().as_slice());
    args.extend_from_slice(seller_lock.calc_script_hash().as_slice());
    args.extend_from_slice(arbiter_lock.calc_script_hash().as_slice());
    args.extend_from_slice(&timeout.to_le_bytes());

    let escrow_lock = context
        .build_script(&escrow_code, Bytes::from(args))
        .expect("escrow lock");

    Escrow {
        context,
        escrow_lock,
        buyer_lock,
        seller_lock,
        arbiter_lock,
        stranger_lock,
    }
}

/// Spend the escrow cell alongside the given party cells, committing
/// `escrow_since` on the escrow input.
fn spend(e: &mut Escrow, parties: &[&Script], escrow_since: u64) -> TransactionView {
    let escrow_out = e.context.create_cell(
        CellOutput::new_builder()
            .capacity(u64_le(1000))
            .lock(e.escrow_lock.clone())
            .build(),
        Bytes::new(),
    );
    let mut inputs = vec![
        CellInput::new_builder()
            .previous_output(escrow_out)
            .since(u64_le(escrow_since))
            .build(),
    ];

    for lock in parties {
        let out = e.context.create_cell(
            CellOutput::new_builder()
                .capacity(u64_le(1000))
                .lock((*lock).clone())
                .build(),
            Bytes::new(),
        );
        inputs.push(CellInput::new_builder().previous_output(out).build());
    }

    let outputs = vec![
        CellOutput::new_builder()
            .capacity(u64_le(1000))
            .lock(e.stranger_lock.clone())
            .build(),
    ];

    let tx = TransactionBuilder::default()
        .inputs(inputs)
        .outputs(outputs)
        .outputs_data([Bytes::new()].pack())
        .build();
    e.context.complete_tx(tx)
}

#[test]
fn mutual_release_succeeds() {
    // #given a buyer and seller who both consent
    let mut e = setup(TIMEOUT);
    let (buyer, seller) = (e.buyer_lock.clone(), e.seller_lock.clone());
    // #when they co-sign the release
    let tx = spend(&mut e, &[&buyer, &seller], 0);
    // #then the escrow unlocks
    e.context
        .verify_tx(&tx, MAX_CYCLES)
        .expect("mutual release");
}

#[test]
fn arbiter_with_seller_succeeds() {
    // #given a dispute the arbiter resolves toward the seller
    let mut e = setup(TIMEOUT);
    let (arbiter, seller) = (e.arbiter_lock.clone(), e.seller_lock.clone());
    // #when arbiter and seller sign
    let tx = spend(&mut e, &[&arbiter, &seller], 0);
    // #then the escrow unlocks
    e.context
        .verify_tx(&tx, MAX_CYCLES)
        .expect("arbitrated to seller");
}

#[test]
fn arbiter_with_buyer_succeeds() {
    // #given a dispute the arbiter resolves toward the buyer
    let mut e = setup(TIMEOUT);
    let (arbiter, buyer) = (e.arbiter_lock.clone(), e.buyer_lock.clone());
    // #when arbiter and buyer sign
    let tx = spend(&mut e, &[&arbiter, &buyer], 0);
    // #then the escrow unlocks
    e.context
        .verify_tx(&tx, MAX_CYCLES)
        .expect("arbitrated to buyer");
}

#[test]
fn timeout_refund_succeeds() {
    // #given a stalled deal past the deadline
    let mut e = setup(TIMEOUT);
    let buyer = e.buyer_lock.clone();
    // #when the buyer alone spends with a matured `since`
    let tx = spend(&mut e, &[&buyer], TIMEOUT);
    // #then the buyer reclaims the funds
    e.context
        .verify_tx(&tx, MAX_CYCLES)
        .expect("timeout refund");
}

#[test]
fn buyer_alone_before_timeout_fails() {
    // #given the deadline has not been reached
    let mut e = setup(TIMEOUT);
    let buyer = e.buyer_lock.clone();
    // #when the buyer alone tries to spend with an immature `since`
    let tx = spend(&mut e, &[&buyer], BEFORE_TIMEOUT);
    // #then the escrow rejects the spend
    assert!(e.context.verify_tx(&tx, MAX_CYCLES).is_err());
}

#[test]
fn arbiter_alone_fails() {
    // #given only the arbiter consents
    let mut e = setup(TIMEOUT);
    let arbiter = e.arbiter_lock.clone();
    // #when the arbiter alone tries to spend
    let tx = spend(&mut e, &[&arbiter], 0);
    // #then the escrow rejects the spend
    assert!(e.context.verify_tx(&tx, MAX_CYCLES).is_err());
}

#[test]
fn stranger_only_fails() {
    // #given an unrelated party
    let mut e = setup(TIMEOUT);
    let stranger = e.stranger_lock.clone();
    // #when the stranger alone tries to spend
    let tx = spend(&mut e, &[&stranger], TIMEOUT);
    // #then the escrow rejects the spend
    assert!(e.context.verify_tx(&tx, MAX_CYCLES).is_err());
}
