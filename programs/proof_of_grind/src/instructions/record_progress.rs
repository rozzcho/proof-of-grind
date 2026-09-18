use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Challenge, Participant},
};

/// The server records a day as passed once the participant hits the daily goal.
#[derive(Accounts)]
pub struct RecordProgress<'info> {
    #[account(mut, address = VERIFIER @ ErrorCode::InvalidVerifier)]
    pub oracle: Signer<'info>,
    pub challenge: Account<'info, Challenge>,
    #[account(mut, has_one = challenge)]
    pub participant: Account<'info, Participant>,
}

pub fn handle_record_progress(ctx: Context<RecordProgress>, day_index: u8) -> Result<()> {
    let challenge = &ctx.accounts.challenge;
    let config = track_config(challenge.track).ok_or(ErrorCode::InvalidTrack)?;
    require!(day_index < config.days, ErrorCode::InvalidDay);

    let day_start = challenge
        .start_ts
        .checked_add(i64::from(day_index).checked_mul(config.day_seconds).ok_or(ErrorCode::MathOverflow)?)
        .ok_or(ErrorCode::MathOverflow)?;
    let deadline = challenge
        .end_ts
        .checked_add(config.record_window)
        .ok_or(ErrorCode::MathOverflow)?;

    let now = Clock::get()?.unix_timestamp;
    require!(now >= day_start, ErrorCode::DayNotStarted);
    // The record window after the end covers retries and server outages.
    require!(now < deadline, ErrorCode::RecordingClosed);

    // Recording the same day twice is harmless.
    ctx.accounts.participant.days_completed |= 1u16 << day_index;
    Ok(())
}
