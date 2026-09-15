use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{constants::*, error::ErrorCode, state::Challenge};

#[derive(Accounts)]
#[instruction(track: u8, challenge_id: u64)]
pub struct CreateChallenge<'info> {
    #[account(mut, address = ADMIN @ ErrorCode::Unauthorized)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + Challenge::INIT_SPACE,
        seeds = [CHALLENGE_SEED, &[track], &challenge_id.to_le_bytes()],
        bump
    )]
    pub challenge: Account<'info, Challenge>,
    #[account(address = USDC_MINT, mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = challenge,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_challenge(
    ctx: Context<CreateChallenge>,
    track: u8,
    challenge_id: u64,
    entry_fee: u64,
) -> Result<()> {
    require!(
        track == TRACK_WEEKLY || track == TRACK_BIWEEKLY,
        ErrorCode::InvalidTrack
    );
    require!(entry_fee > 0, ErrorCode::InvalidEntryFee);

    ctx.accounts.challenge.set_inner(Challenge {
        authority: ctx.accounts.authority.key(),
        mint: ctx.accounts.mint.key(),
        track,
        challenge_id,
        entry_fee,
        participant_count: 0,
        total_deposited: 0,
        bump: ctx.bumps.challenge,
    });
    Ok(())
}
