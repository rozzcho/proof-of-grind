use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::{constants::*, error::ErrorCode, state::Challenge};

/// Takes what is left in the vault once the winners are paid: the 5% fee and rounding dust.
#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    #[account(mut, address = TREASURY)]
    pub treasury: Signer<'info>,
    #[account(mut, has_one = mint)]
    pub challenge: Account<'info, Challenge>,
    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = challenge,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = treasury,
        token::token_program = token_program,
    )]
    pub treasury_token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_withdraw_fees(ctx: Context<WithdrawFees>) -> Result<()> {
    let challenge = &ctx.accounts.challenge;
    require!(challenge.finalized, ErrorCode::NotFinalized);
    if challenge.winner_count == 0 {
        // The prize pool has to reach the next challenge first.
        require!(challenge.rolled_over, ErrorCode::NothingToRollOver);
    } else {
        require!(
            challenge.claimed_count == challenge.winner_count,
            ErrorCode::ClaimsPending
        );
    }

    let amount = ctx.accounts.vault.amount;
    let track = [challenge.track];
    let challenge_id = challenge.challenge_id.to_le_bytes();
    let seeds: &[&[u8]] = &[CHALLENGE_SEED, &track, &challenge_id, &[challenge.bump]];
    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.treasury_token_account.to_account_info(),
                authority: challenge.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        ctx.accounts.mint.decimals,
    )
}
