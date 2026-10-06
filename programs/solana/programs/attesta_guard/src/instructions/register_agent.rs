use anchor_lang::prelude::*;

use crate::{error::GuardError, AgentPolicy, AgentRegistered, MAX_ALLOWLIST, POLICY_SEED, VAULT_SEED};

#[derive(Accounts)]
pub struct RegisterAgent<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// The agent consents to being governed by this policy.
    pub agent: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + AgentPolicy::INIT_SPACE,
        seeds = [POLICY_SEED, agent.key().as_ref()],
        bump,
    )]
    pub policy: Account<'info, AgentPolicy>,
    /// System-owned PDA that holds the agent's spendable lamports.
    #[account(seeds = [VAULT_SEED, agent.key().as_ref()], bump)]
    pub vault: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<RegisterAgent>,
    authority: Pubkey,
    daily_cap: u64,
    allowlist: Vec<Pubkey>,
) -> Result<()> {
    require!(allowlist.len() <= MAX_ALLOWLIST, GuardError::AllowlistTooLong);
    let policy = &mut ctx.accounts.policy;
    policy.agent = ctx.accounts.agent.key();
    policy.authority = authority;
    policy.daily_cap = daily_cap;
    policy.spent_today = 0;
    policy.day_index = Clock::get()?.unix_timestamp / crate::SECONDS_PER_DAY;
    policy.frozen = false;
    policy.allowlist = allowlist;
    policy.bump = ctx.bumps.policy;
    policy.vault_bump = ctx.bumps.vault;
    emit!(AgentRegistered {
        agent: policy.agent,
        authority,
        daily_cap,
    });
    Ok(())
}
