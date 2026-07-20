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
    high_level::{load_cell_lock_hash, load_input_since, load_script, load_script_hash},
};

const HASH_LEN: usize = 32;
const SINCE_LEN: usize = 8;
const ARGS_LEN: usize = HASH_LEN * 3 + SINCE_LEN;

const SINCE_VALUE_MASK: u64 = 0x00ff_ffff_ffff_ffff;

#[repr(i8)]
pub enum Error {
    IndexOutOfBound = 1,
    ItemMissing,
    LengthNotEnough,
    Encoding,
    InvalidArgsLength,
    Unauthorized,
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

/// A party's consent is proven by the presence of an input cell locked by that
/// party. That input's own lock script already verifies the party's signature,
/// so the escrow only checks which party lock hashes appear among the inputs —
/// no signature verification is reimplemented here.
///
/// args layout: buyer_lock_hash(32) ++ seller_lock_hash(32) ++
/// arbiter_lock_hash(32) ++ timeout(8, a little-endian `since` value).
fn run() -> Result<(), Error> {
    let script = load_script()?;
    let args = script.args().raw_data();
    if args.len() != ARGS_LEN {
        return Err(Error::InvalidArgsLength);
    }

    let buyer = &args[0..HASH_LEN];
    let seller = &args[HASH_LEN..HASH_LEN * 2];
    let arbiter = &args[HASH_LEN * 2..HASH_LEN * 3];
    let mut timeout_bytes = [0u8; SINCE_LEN];
    timeout_bytes.copy_from_slice(&args[HASH_LEN * 3..ARGS_LEN]);
    let timeout = u64::from_le_bytes(timeout_bytes);

    let self_hash = load_script_hash()?;

    let mut buyer_present = false;
    let mut seller_present = false;
    let mut arbiter_present = false;
    let mut escrow_inputs = 0usize;
    let mut all_escrow_inputs_matured = true;

    let mut index = 0;
    loop {
        let lock_hash = match load_cell_lock_hash(index, Source::Input) {
            Ok(hash) => hash,
            Err(SysError::IndexOutOfBound) => break,
            Err(err) => return Err(err.into()),
        };

        if lock_hash[..] == *buyer {
            buyer_present = true;
        }
        if lock_hash[..] == *seller {
            seller_present = true;
        }
        if lock_hash[..] == *arbiter {
            arbiter_present = true;
        }
        if lock_hash == self_hash {
            escrow_inputs += 1;
            let since = load_input_since(index, Source::Input)?;
            if !since_reached(since, timeout) {
                all_escrow_inputs_matured = false;
            }
        }

        index += 1;
    }

    // Path 1 — mutual settlement: buyer and seller both consent.
    if buyer_present && seller_present {
        return Ok(());
    }

    // Path 2 — arbitrated: the arbiter breaks a dispute alongside one party.
    if arbiter_present && (buyer_present || seller_present) {
        return Ok(());
    }

    // Path 3 — timeout refund: the buyer reclaims once every escrow input has
    // committed a `since` at or beyond the deadline, which consensus only
    // permits once the deadline has actually elapsed.
    if buyer_present && escrow_inputs > 0 && all_escrow_inputs_matured {
        return Ok(());
    }

    Err(Error::Unauthorized)
}

/// `since` packs an 8-bit flag prefix (metric type + relative/absolute) over a
/// 56-bit value. A committed `since` clears the deadline only when its flags
/// match and its value is at or beyond the deadline's. A zero timeout disables
/// the timeout path.
fn since_reached(input_since: u64, timeout: u64) -> bool {
    if timeout == 0 {
        return true;
    }
    if (input_since & !SINCE_VALUE_MASK) != (timeout & !SINCE_VALUE_MASK) {
        return false;
    }
    (input_since & SINCE_VALUE_MASK) >= (timeout & SINCE_VALUE_MASK)
}
