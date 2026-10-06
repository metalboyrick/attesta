use anchor_lang::prelude::*;

#[error_code]
pub enum GuardError {
    #[msg("Agent is frozen by its compliance authority")]
    AgentFrozen,
    #[msg("Spend would exceed the agent's daily cap")]
    OverDailyCap,
    #[msg("Allowlist exceeds the maximum length")]
    AllowlistTooLong,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
}
