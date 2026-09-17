use anchor_lang::prelude::*;

use crate::{constants::*, error::ErrorCode};

#[account]
#[derive(InitSpace)]
pub struct Challenge {
    pub track: u8,
    pub challenge_id: u64,
    pub mint: Pubkey,
    /// Per 1x, in mint base units (USDC: 6 decimals).
    pub entry_fee: u64,
    pub start_ts: i64,
    pub end_ts: i64,
    pub participant_count: u32,
    /// Sum of every participant's multiply.
    pub total_shares: u64,
    /// Everything paid in: the entry pool.
    pub total_deposited: u64,
    /// Prize pool rolled over from an earlier challenge nobody won.
    pub carry_over: u64,
    /// Sum of the winners' multiply; rewards are split by these shares.
    pub winner_shares: u64,
    pub winner_count: u32,
    pub tallied_count: u32,
    pub claimed_count: u32,
    /// Every participant has been counted, so the winners are known.
    pub finalized: bool,
    pub rolled_over: bool,
    pub bump: u8,
}

impl Challenge {
    /// What the winners share: the entry pool minus fees, plus anything rolled over.
    pub fn prize_pool(&self) -> Result<u64> {
        let after_fee = (self.total_deposited as u128)
            .checked_mul((10_000 - FEE_BPS) as u128)
            .ok_or(ErrorCode::MathOverflow)?
            / 10_000;
        u64::try_from(after_fee)
            .ok()
            .and_then(|pool| pool.checked_add(self.carry_over))
            .ok_or(ErrorCode::MathOverflow.into())
    }
}

#[account]
#[derive(InitSpace)]
pub struct Participant {
    pub challenge: Pubkey,
    pub user: Pubkey,
    pub discord_id: u64,
    pub multiply: u8,
    pub amount_paid: u64,
    pub registered_at: i64,
    /// One bit per day of the challenge; all bits set means they passed.
    pub days_completed: u16,
    pub tallied: bool,
    pub claimed: bool,
    pub bump: u8,
}

/// One Discord account can join a challenge only once.
/// Stops one person from being in challenges on two tracks at the same time.
/// Holds the period of their latest challenge; consecutive challenges on one track merge into it.
#[account]
#[derive(InitSpace)]
pub struct ParticipationLock {
    pub track: u8,
    pub start_ts: i64,
    pub end_ts: i64,
    pub bump: u8,
}

impl ParticipationLock {
    /// Fails if the new challenge overlaps a challenge on another track, then covers it.
    pub fn claim(&mut self, track: u8, start_ts: i64, end_ts: i64, bump: u8) -> Result<()> {
        let empty = self.end_ts == 0;
        let overlaps = start_ts < self.end_ts && self.start_ts < end_ts;
        require!(empty || self.track == track || !overlaps, ErrorCode::OverlappingChallenge);

        if !empty && self.track == track && start_ts <= self.end_ts && self.start_ts <= end_ts {
            self.start_ts = self.start_ts.min(start_ts);
            self.end_ts = self.end_ts.max(end_ts);
        } else {
            self.track = track;
            self.start_ts = start_ts;
            self.end_ts = end_ts;
        }
        self.bump = bump;
        Ok(())
    }
}

#[account]
#[derive(InitSpace)]
pub struct DiscordLink {
    pub challenge: Pubkey,
    pub discord_id: u64,
    pub user: Pubkey,
    pub bump: u8,
}
