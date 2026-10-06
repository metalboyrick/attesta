use anchor_lang::prelude::*;

use crate::MAX_ALLOWLIST;

/// Spend policy for one agent. PDA: ["policy", agent].
#[account]
#[derive(InitSpace)]
pub struct AgentPolicy {
    pub agent: Pubkey,
    /// Compliance authority (relayer) allowed to freeze and edit the policy.
    pub authority: Pubkey,
    /// Max lamports the agent may spend per UTC day.
    pub daily_cap: u64,
    pub spent_today: u64,
    /// unix_timestamp / 86400 of the day `spent_today` belongs to.
    pub day_index: i64,
    pub frozen: bool,
    #[max_len(MAX_ALLOWLIST)]
    pub allowlist: Vec<Pubkey>,
    pub bump: u8,
    pub vault_bump: u8,
}

#[event]
pub struct AgentRegistered {
    pub agent: Pubkey,
    pub authority: Pubkey,
    pub daily_cap: u64,
}

#[event]
pub struct FrozenChanged {
    pub agent: Pubkey,
    pub authority: Pubkey,
    pub frozen: bool,
    pub reason_code: u32,
    pub ts: i64,
}

#[event]
pub struct PolicyUpdated {
    pub agent: Pubkey,
    pub daily_cap: u64,
    pub allowlist_len: u8,
}

/// Evidence record for off-chain control evaluation (CRE).
#[event]
pub struct SpendEvent {
    pub agent: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub spent_today: u64,
    pub daily_cap: u64,
    /// False when the recipient is not on the allowlist. Spend still succeeds;
    /// the allowlist control is evaluated off-chain and may freeze the agent.
    pub allowlisted: bool,
    pub ts: i64,
}
