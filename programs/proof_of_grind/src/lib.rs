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

    pub fn create_challenge(
        ctx: Context<CreateChallenge>,
        track: u8,
        challenge_id: u64,
        entry_fee: u64,
    ) -> Result<()> {
        crate::instructions::create_challenge::handle_create_challenge(
            ctx,
            track,
            challenge_id,
            entry_fee,
        )
    }

    pub fn register(ctx: Context<Register>, discord_id: u64) -> Result<()> {
        crate::instructions::register::handle_register(ctx, discord_id)
    }
}
