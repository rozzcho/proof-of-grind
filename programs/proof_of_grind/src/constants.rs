use anchor_lang::prelude::*;

/// Only this wallet can create challenges.
#[constant]
pub const ADMIN: Pubkey = pubkey!("Gda3akHfzA74Dyz7qJhrj2EsFYX8AqH8s2Za41XpQMNf");

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

#[constant]
pub const TRACK_BIWEEKLY: u8 = 1;
