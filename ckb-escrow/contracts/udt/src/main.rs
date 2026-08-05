#![cfg_attr(not(any(feature = "library", test)), no_std)]
#![cfg_attr(not(test), no_main)]

#[cfg(any(feature = "library", test))]
extern crate alloc;

#[cfg(not(any(feature = "library", test)))]
ckb_std::entry!(program_entry);
#[cfg(not(any(feature = "library", test)))]
ckb_std::default_alloc!(16384, 1258306, 64);

use ckb_std::{
    ckb_constants::Source,
    error::SysError,
    high_level::{load_cell_data, load_cell_lock_hash, load_script},
};

const HASH_LEN: usize = 32;
const AMOUNT_LEN: usize = 16;

#[repr(i8)]
pub enum Error {
    IndexOutOfBound = 1,
    ItemMissing,
    LengthNotEnough,
    Encoding,
    InvalidArgsLength,
    InvalidAmountData,
    AmountOverflow,
    InflatedSupply,
}

impl From<SysError> for Error {
    fn from(err: SysError) -> Self {
        match err {
            SysError::IndexOutOfBound => Self::IndexOutOfBound,
            SysError::ItemMissing => Self::ItemMissing,
            SysError::LengthNotEnough(_) => Self::LengthNotEnough,
            _ => Self::Encoding,
        }
    }
}

pub fn program_entry() -> i8 {
    match run() {
        Ok(()) => 0,
        Err(err) => err as i8,
    }
}

/// A minimal sUDT (RFC-0025) type script.
///
/// Unlike a lock script, which is asked "may this one cell be spent", a type
/// script is asked "is this whole state transition valid". It runs once per
/// transaction over its *script group* — every input and output cell carrying
/// this exact type script — which is what lets it reason about a balance the
/// way an account-model contract reasons about its own storage.
///
/// args layout: owner_lock_hash(32).
/// cell data layout: amount(16, little-endian u128) ++ optional extra data.
fn run() -> Result<(), Error> {
    let script = load_script()?;
    let args = script.args().raw_data();
    if args.len() != HASH_LEN {
        return Err(Error::InvalidArgsLength);
    }

    // Owner mode is the mint/burn escape hatch: whoever can satisfy the owner
    // lock may create supply from nothing. The owner proves themselves the same
    // way the escrow's parties do — by unlocking a cell under that lock
    // somewhere in the inputs, whose own lock script checks the signature.
    if owner_is_present(&args)? {
        return Ok(());
    }

    let input_amount = sum_group_amounts(Source::GroupInput)?;
    let output_amount = sum_group_amounts(Source::GroupOutput)?;

    // Burning is allowed, minting is not. Capacity is conserved by consensus;
    // this balance is conserved only because this script says so.
    if output_amount > input_amount {
        return Err(Error::InflatedSupply);
    }

    Ok(())
}

fn owner_is_present(owner_lock_hash: &[u8]) -> Result<bool, Error> {
    let mut index = 0;
    loop {
        match load_cell_lock_hash(index, Source::Input) {
            Ok(lock_hash) => {
                if lock_hash[..] == *owner_lock_hash {
                    return Ok(true);
                }
            }
            Err(SysError::IndexOutOfBound) => return Ok(false),
            Err(err) => return Err(err.into()),
        }
        index += 1;
    }
}

/// Sum the token amounts over one side of this script's group. `GroupInput` and
/// `GroupOutput` index only the cells carrying this type script, so the walk
/// never has to filter unrelated cells out by hand.
fn sum_group_amounts(source: Source) -> Result<u128, Error> {
    let mut total: u128 = 0;
    let mut index = 0;
    loop {
        let data = match load_cell_data(index, source) {
            Ok(data) => data,
            Err(SysError::IndexOutOfBound) => break,
            Err(err) => return Err(err.into()),
        };
        if data.len() < AMOUNT_LEN {
            return Err(Error::InvalidAmountData);
        }
        let mut amount_bytes = [0u8; AMOUNT_LEN];
        amount_bytes.copy_from_slice(&data[..AMOUNT_LEN]);
        total = total
            .checked_add(u128::from_le_bytes(amount_bytes))
            .ok_or(Error::AmountOverflow)?;
        index += 1;
    }
    Ok(total)
}
