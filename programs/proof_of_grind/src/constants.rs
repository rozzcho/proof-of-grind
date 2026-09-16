use anchor_lang::prelude::*;

/// Server key that co-signs `register` after verifying the Discord account via OAuth.
#[constant]
pub const VERIFIER: Pubkey = pubkey!("HfAMz1kUe8xYxoC4BamRuC8sGB2Zh7gKTkgzf26c9xmP");

/// Circle devnet USDC.
#[constant]
pub const USDC_MINT: Pubkey = pubkey!("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

#[constant]
pub const CHALLENGE_SEED: &[u8] = b"challenge";

#[constant]
pub const PARTICIPANT_SEED: &[u8] = b"participant";

#[constant]
pub const DISCORD_SEED: &[u8] = b"discord";

#[constant]
pub const TRACK_WEEKLY: u8 = 0;

/// Weekly Challenge #0 starts Monday 2026-09-21 00:00 UTC; #n starts n weeks later.
#[constant]
pub const WEEKLY_LAUNCH_TS: i64 = 1_789_948_800;

#[constant]
pub const WEEK_SECONDS: i64 = 7 * 24 * 60 * 60;

/// 7 USDC (6 decimals) per 1x.
#[constant]
pub const WEEKLY_ENTRY_FEE: u64 = 7_000_000;

#[constant]
pub const MAX_MULTIPLY: u8 = 10;
