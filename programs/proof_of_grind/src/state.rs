use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Challenge {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub track: u8,
    pub challenge_id: u64,
    /// In mint base units (USDC: 6 decimals).
    pub entry_fee: u64,
    pub participant_count: u32,
    pub total_deposited: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Participant {
    pub challenge: Pubkey,
    pub user: Pubkey,
    pub discord_id: u64,
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
