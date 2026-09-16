use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Challenge, Participant},
};

/// Counts one participant after the challenge ends. Anyone can call it: the result only
/// depends on what is already on chain.
#[derive(Accounts)]
pub struct Tally<'info> {
    #[account(mut, has_one = challenge)]
    pub participant: Account<'info, Participant>,
    #[account(mut)]
    pub challenge: Account<'info, Challenge>,
}

pub fn handle_tally(ctx: Context<Tally>) -> Result<()> {
    let participant = &mut ctx.accounts.participant;
    let challenge = &mut ctx.accounts.challenge;
    let config = track_config(challenge.track).ok_or(ErrorCode::InvalidTrack)?;

    require!(
        Clock::get()?.unix_timestamp >= challenge.end_ts,
        ErrorCode::ChallengeNotOver
    );
    require!(!participant.tallied, ErrorCode::AlreadyTallied);

    participant.tallied = true;
    if participant.days_completed == config.full_mask() {
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
