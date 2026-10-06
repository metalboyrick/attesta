use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

use crate::{error::GuardError, AgentPolicy, SpendEvent, POLICY_SEED, SECONDS_PER_DAY, VAULT_SEED};

#[derive(Accounts)]
pub struct Spend<'info> {
    pub agent: Signer<'info>,
    #[account(
        mut,
        seeds = [POLICY_SEED, agent.key().as_ref()],
        bump = policy.bump,
        has_one = agent,
    )]
    pub policy: Account<'info, AgentPolicy>,
    #[account(mut, seeds = [VAULT_SEED, agent.key().as_ref()], bump = policy.vault_bump)]
    pub vault: SystemAccount<'info>,
    /// CHECK: any account may receive lamports; allowlist membership is
    /// reported in SpendEvent and enforced off-chain via freeze.
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Spend>, amount: u64) -> Result<()> {
    require!(amount > 0, GuardError::ZeroAmount);
    let policy = &mut ctx.accounts.policy;
    require!(!policy.frozen, GuardError::AgentFrozen);

    let now = Clock::get()?.unix_timestamp;
    let today = now / SECONDS_PER_DAY;
    if today != policy.day_index {
        policy.day_index = today;
        policy.spent_today = 0;
    }
    let spent = policy
        .spent_today
        .checked_add(amount)
        .ok_or(GuardError::OverDailyCap)?;
    require!(spent <= policy.daily_cap, GuardError::OverDailyCap);
    policy.spent_today = spent;

    let agent_key = ctx.accounts.agent.key();
    let seeds: &[&[u8]] = &[VAULT_SEED, agent_key.as_ref(), &[policy.vault_bump]];
    transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.key(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.recipient.to_account_info(),
            },
            &[seeds],
        ),
        amount,
    )?;

    let recipient = ctx.accounts.recipient.key();
    emit!(SpendEvent {
        agent: agent_key,
        recipient,
        amount,
        spent_today: spent,
        daily_cap: policy.daily_cap,
        allowlisted: policy.allowlist.contains(&recipient),
        ts: now,
    });
    Ok(())
}
