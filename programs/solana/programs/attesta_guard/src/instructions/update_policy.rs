use anchor_lang::prelude::*;

use crate::{error::GuardError, AgentPolicy, PolicyUpdated, MAX_ALLOWLIST, POLICY_SEED};

#[derive(Accounts)]
pub struct UpdatePolicy<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [POLICY_SEED, policy.agent.as_ref()],
        bump = policy.bump,
        has_one = authority,
    )]
    pub policy: Account<'info, AgentPolicy>,
}

pub fn handler(ctx: Context<UpdatePolicy>, daily_cap: u64, allowlist: Vec<Pubkey>) -> Result<()> {
    require!(allowlist.len() <= MAX_ALLOWLIST, GuardError::AllowlistTooLong);
    let policy = &mut ctx.accounts.policy;
    policy.daily_cap = daily_cap;
    policy.allowlist = allowlist;
    emit!(PolicyUpdated {
        agent: policy.agent,
        daily_cap,
        allowlist_len: policy.allowlist.len() as u8,
    });
    Ok(())
}
