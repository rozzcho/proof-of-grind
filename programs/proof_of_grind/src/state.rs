use anchor_lang::prelude::*;

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
    /// Sum of every participant's multiply; rewards are split by these shares.
    pub total_shares: u64,
    pub total_deposited: u64,
    pub bump: u8,
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
    pub bump: u8,
}

/// One Discord account can join a challenge only once.
#[account]
#[derive(InitSpace)]
pub struct DiscordLink {
    pub challenge: Pubkey,
    pub discord_id: u64,
    pub user: Pubkey,
    pub bump: u8,
}
