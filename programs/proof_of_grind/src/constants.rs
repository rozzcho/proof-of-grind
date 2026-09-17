use anchor_lang::prelude::*;

/// Server key: co-signs `register` after verifying the Discord account, and records daily progress.
#[constant]
pub const VERIFIER: Pubkey = pubkey!("HfAMz1kUe8xYxoC4BamRuC8sGB2Zh7gKTkgzf26c9xmP");

/// Receives the platform fee and leftover rounding dust.
#[constant]
pub const TREASURY: Pubkey = pubkey!("Gda3akHfzA74Dyz7qJhrj2EsFYX8AqH8s2Za41XpQMNf");

/// Circle devnet USDC.
#[constant]
pub const USDC_MINT: Pubkey = pubkey!("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

#[constant]
pub const CHALLENGE_SEED: &[u8] = b"challenge";

#[constant]
pub const PARTICIPANT_SEED: &[u8] = b"participant";

#[constant]
pub const DISCORD_SEED: &[u8] = b"discord";

/// One participation lock per wallet and one per Discord account, shared by every track.
#[constant]
pub const WALLET_LOCK_SEED: &[u8] = b"wallet_lock";

#[constant]
pub const DISCORD_LOCK_SEED: &[u8] = b"discord_lock";

#[constant]
pub const MAX_MULTIPLY: u8 = 10;

/// Platform + exchange fee, in basis points of the entry pool.
#[constant]
pub const FEE_BPS: u64 = 500;

/// Rewards are rounded down to 0.01 USDC.
#[constant]
pub const PAYOUT_UNIT: u64 = 10_000;

#[constant]
pub const TRACK_WEEKLY: u8 = 0;

/// Opens every other week and runs for two weeks.
#[constant]
pub const TRACK_BIWEEKLY: u8 = 1;

/// Short track for testing the full cycle without waiting a week.
#[constant]
pub const TRACK_TEST: u8 = 2;

/// Weekly Challenge #0 starts Monday 2026-09-21 00:00 UTC; #n starts n weeks later.
#[constant]
pub const WEEKLY_LAUNCH_TS: i64 = 1_789_948_800;

#[constant]
pub const WEEK_SECONDS: i64 = 7 * 24 * 60 * 60;

#[constant]
pub const WEEKLY_DAY_SECONDS: i64 = 24 * 60 * 60;

#[constant]
pub const WEEKLY_DAYS: u8 = 7;

/// 7 USDC (6 decimals) per 1x.
#[constant]
pub const WEEKLY_ENTRY_FEE: u64 = 7_000_000;

/// Placeholder until the first Biweekly date is decided: Monday 2026-10-05 00:00 UTC.
/// Registration stays closed until then (the server only co-signs the Weekly track).
#[constant]
pub const BIWEEKLY_LAUNCH_TS: i64 = WEEKLY_LAUNCH_TS + 2 * WEEK_SECONDS;

#[constant]
pub const BIWEEKLY_DURATION: i64 = 2 * WEEK_SECONDS;

#[constant]
pub const BIWEEKLY_DAY_SECONDS: i64 = 24 * 60 * 60;

#[constant]
pub const BIWEEKLY_DAYS: u8 = 14;

/// 10 USDC (6 decimals) per 1x.
#[constant]
pub const BIWEEKLY_ENTRY_FEE: u64 = 10_000_000;

/// Test challenges run every 10 minutes, with five 2-minute "days".
#[constant]
pub const TEST_LAUNCH_TS: i64 = 0;

#[constant]
pub const TEST_DURATION: i64 = 10 * 60;

#[constant]
pub const TEST_DAY_SECONDS: i64 = 2 * 60;

#[constant]
pub const TEST_DAYS: u8 = 5;

#[constant]
pub const TEST_ENTRY_FEE: u64 = 1_000_000;

/// Everything that differs between tracks.
pub struct TrackConfig {
    /// Challenge #0 starts here; #n starts n durations later.
    pub launch_ts: i64,
    pub duration: i64,
    pub day_seconds: i64,
    pub days: u8,
    /// Per 1x, in mint base units.
    pub entry_fee: u64,
}

impl TrackConfig {
    /// Bitmask with one bit per day: every bit set means the participant passed the challenge.
    pub const fn full_mask(&self) -> u16 {
        (1u16 << self.days) - 1
    }
}

pub const fn track_config(track: u8) -> Option<TrackConfig> {
    match track {
        TRACK_WEEKLY => Some(TrackConfig {
            launch_ts: WEEKLY_LAUNCH_TS,
            duration: WEEK_SECONDS,
            day_seconds: WEEKLY_DAY_SECONDS,
            days: WEEKLY_DAYS,
            entry_fee: WEEKLY_ENTRY_FEE,
        }),
        TRACK_BIWEEKLY => Some(TrackConfig {
            launch_ts: BIWEEKLY_LAUNCH_TS,
            duration: BIWEEKLY_DURATION,
            day_seconds: BIWEEKLY_DAY_SECONDS,
            days: BIWEEKLY_DAYS,
            entry_fee: BIWEEKLY_ENTRY_FEE,
        }),
        TRACK_TEST => Some(TrackConfig {
            launch_ts: TEST_LAUNCH_TS,
            duration: TEST_DURATION,
            day_seconds: TEST_DAY_SECONDS,
            days: TEST_DAYS,
            entry_fee: TEST_ENTRY_FEE,
        }),
        _ => None,
    }
}
