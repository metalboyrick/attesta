pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("2ppMVjwBs8dqNppcJctfTJaVb3rtfFFe5cDmJyxCGuSW");

/// Attesta guard: agent spends route through this program. A compliance
/// authority freezes an agent when an off-chain control fails; frozen agents
/// cannot spend.
#[program]
pub mod attesta_guard {
    use super::*;

    pub fn register_agent(
        ctx: Context<RegisterAgent>,
        authority: Pubkey,
        daily_cap: u64,
        allowlist: Vec<Pubkey>,
    ) -> Result<()> {
        register_agent::handler(ctx, authority, daily_cap, allowlist)
    }

    pub fn set_frozen(ctx: Context<SetFrozen>, frozen: bool, reason_code: u32) -> Result<()> {
        set_frozen::handler(ctx, frozen, reason_code)
    }

    pub fn update_policy(
        ctx: Context<UpdatePolicy>,
        daily_cap: u64,
        allowlist: Vec<Pubkey>,
    ) -> Result<()> {
        update_policy::handler(ctx, daily_cap, allowlist)
    }

    pub fn spend(ctx: Context<Spend>, amount: u64) -> Result<()> {
        spend::handler(ctx, amount)
    }
}
