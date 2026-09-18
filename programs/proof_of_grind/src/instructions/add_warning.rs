use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Challenge, Participant, Warning},
};

/// The server gives a participant a warning once a jury upholds a report against them.
#[derive(Accounts)]
pub struct AddWarning<'info> {
    #[account(mut, address = VERIFIER @ ErrorCode::InvalidVerifier)]
    pub oracle: Signer<'info>,
    pub challenge: Account<'info, Challenge>,
    #[account(has_one = challenge)]
    pub participant: Account<'info, Participant>,
    #[account(
        init_if_needed,
        payer = oracle,
        space = 8 + Warning::INIT_SPACE,
        seeds = [WARNING_SEED, challenge.key().as_ref(), participant.user.as_ref()],
        bump
    )]
    pub warning: Account<'info, Warning>,
    pub system_program: Program<'info, System>,
}

pub fn handle_add_warning(ctx: Context<AddWarning>) -> Result<()> {
    let challenge = &ctx.accounts.challenge;
    let participant = &ctx.accounts.participant;
    let config = track_config(challenge.track).ok_or(ErrorCode::InvalidTrack)?;

    // Only while results are not open yet, so a warning never changes a tally already made.
    let results_open = challenge
        .end_ts
        .checked_add(config.record_window)
        .ok_or(ErrorCode::MathOverflow)?;
    require!(
        Clock::get()?.unix_timestamp < results_open && !participant.tallied,
        ErrorCode::WarningsClosed
    );

    let warning = &mut ctx.accounts.warning;
    warning.challenge = challenge.key();
    warning.user = participant.user;
    warning.count = warning.count.checked_add(1).ok_or(ErrorCode::MathOverflow)?;
    warning.bump = ctx.bumps.warning;
    Ok(())
}
