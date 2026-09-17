use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Challenge, Participant, Warning},
};

/// Counts one participant after the challenge ends. Anyone can call it: the result only
/// depends on what is already on chain.
#[derive(Accounts)]
pub struct Tally<'info> {
    #[account(mut, has_one = challenge)]
    pub participant: Account<'info, Participant>,
    #[account(mut)]
    pub challenge: Account<'info, Challenge>,
    /// CHECK: the participant's warning address. It may not exist (no warnings); the seeds make
    /// sure a caller cannot pass another account to hide warnings.
    #[account(seeds = [WARNING_SEED, challenge.key().as_ref(), participant.user.as_ref()], bump)]
    pub warning: UncheckedAccount<'info>,
}

pub fn handle_tally(ctx: Context<Tally>) -> Result<()> {
    let participant = &mut ctx.accounts.participant;
    let challenge = &mut ctx.accounts.challenge;
    let config = track_config(challenge.track).ok_or(ErrorCode::InvalidTrack)?;

    // Wait for the record window to close, so a day still being recorded cannot be counted as missed.
    let results_open = challenge
        .end_ts
        .checked_add(config.record_window())
        .ok_or(ErrorCode::MathOverflow)?;
    require!(
        Clock::get()?.unix_timestamp >= results_open,
        ErrorCode::ChallengeNotOver
    );
    require!(!participant.tallied, ErrorCode::AlreadyTallied);

    participant.tallied = true;
    let warned_out = Warning::count_at(&ctx.accounts.warning)? >= MAX_WARNINGS;
    if participant.days_completed == config.full_mask() && !warned_out {
        challenge.winner_shares = challenge
            .winner_shares
            .checked_add(u64::from(participant.multiply))
            .ok_or(ErrorCode::MathOverflow)?;
        challenge.winner_count = challenge.winner_count.checked_add(1).ok_or(ErrorCode::MathOverflow)?;
    }
    challenge.tallied_count = challenge.tallied_count.checked_add(1).ok_or(ErrorCode::MathOverflow)?;
    if challenge.tallied_count == challenge.participant_count {
        challenge.finalized = true;
    }
    Ok(())
}
