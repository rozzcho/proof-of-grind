use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::{constants::*, error::ErrorCode, state::Challenge};

/// Nobody passed: the prize pool moves to a later challenge on the same track.
#[derive(Accounts)]
pub struct Rollover<'info> {
    #[account(mut, has_one = mint)]
    pub from: Account<'info, Challenge>,
    #[account(mut, has_one = mint)]
    pub to: Account<'info, Challenge>,
    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = from,
        associated_token::token_program = token_program,
    )]
    pub from_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = to,
        associated_token::token_program = token_program,
    )]
    pub to_vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_rollover(ctx: Context<Rollover>) -> Result<()> {
    let from = &mut ctx.accounts.from;
    let to = &mut ctx.accounts.to;

    require!(from.finalized, ErrorCode::NotFinalized);
    require!(from.winner_shares == 0, ErrorCode::NothingToRollOver);
    require!(!from.rolled_over, ErrorCode::AlreadyRolledOver);
    require!(
        to.track == from.track && to.challenge_id > from.challenge_id,
        ErrorCode::InvalidRolloverTarget
    );

    let amount = from.prize_pool()?;
    from.rolled_over = true;
    from.carry_over = 0;
    to.carry_over = to.carry_over.checked_add(amount).ok_or(ErrorCode::MathOverflow)?;

    let track = [from.track];
    let challenge_id = from.challenge_id.to_le_bytes();
    let seeds: &[&[u8]] = &[CHALLENGE_SEED, &track, &challenge_id, &[from.bump]];
    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.from_vault.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.to_vault.to_account_info(),
                authority: from.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        ctx.accounts.mint.decimals,
    )
}
