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
}
