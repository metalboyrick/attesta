use anchor_lang::prelude::*;

#[constant]
pub const POLICY_SEED: &[u8] = b"policy";

#[constant]
pub const VAULT_SEED: &[u8] = b"vault";

/// Max recipients an agent policy can allowlist.
pub const MAX_ALLOWLIST: usize = 8;

pub const SECONDS_PER_DAY: i64 = 86_400;
