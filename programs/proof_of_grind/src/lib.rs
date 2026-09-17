pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("xCXUMjagsYgaVK8XLW4Wz9kbrswAsd5s3TPCGDsAFUG");

#[program]
pub mod proof_of_grind {
    use super::*;

    /// Pays `entry_fee × multiply` into the challenge vault and joins the pool.
    pub fn register(
        ctx: Context<Register>,
        track: u8,
        challenge_id: u64,
        discord_id: u64,
        multiply: u8,
    ) -> Result<()> {
        crate::instructions::register::handle_register(ctx, track, challenge_id, discord_id, multiply)
    }

    /// Marks one day as passed for a participant.
    pub fn record_progress(ctx: Context<RecordProgress>, day_index: u8) -> Result<()> {
        crate::instructions::record_progress::handle_record_progress(ctx, day_index)
    }

    /// Gives a participant a warning; 3 warnings and they are out.
    pub fn add_warning(ctx: Context<AddWarning>) -> Result<()> {
        crate::instructions::add_warning::handle_add_warning(ctx)
    }

    /// Counts one participant after the challenge ends; the last one finalizes it.
    pub fn tally(ctx: Context<Tally>) -> Result<()> {
        crate::instructions::tally::handle_tally(ctx)
    }

    /// A winner withdraws their share of the prize pool.
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        crate::instructions::claim::handle_claim(ctx)
    }

    /// Moves the prize pool of a challenge nobody won into a later one.
    pub fn rollover(ctx: Context<Rollover>) -> Result<()> {
        crate::instructions::rollover::handle_rollover(ctx)
    }

    /// Sends the platform fee and rounding dust to the treasury.
    pub fn withdraw_fees(ctx: Context<WithdrawFees>) -> Result<()> {
        crate::instructions::withdraw_fees::handle_withdraw_fees(ctx)
    }
}
