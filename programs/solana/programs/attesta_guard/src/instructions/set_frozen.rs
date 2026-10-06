use anchor_lang::prelude::*;

use crate::{AgentPolicy, FrozenChanged, POLICY_SEED};

#[derive(Accounts)]
pub struct SetFrozen<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [POLICY_SEED, policy.agent.as_ref()],
        bump = policy.bump,
        has_one = authority,
    )]
    pub policy: Account<'info, AgentPolicy>,
}

/// `reason_code` is an opaque control id from the off-chain evaluator.
pub fn handler(ctx: Context<SetFrozen>, frozen: bool, reason_code: u32) -> Result<()> {
    let policy = &mut ctx.accounts.policy;
    policy.frozen = frozen;
    emit!(FrozenChanged {
        agent: policy.agent,
        authority: policy.authority,
        frozen,
        reason_code,
        ts: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
