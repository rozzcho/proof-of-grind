use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Challenge, Participant, Warning},
};

/// A winner withdraws their share of the prize pool.
#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, has_one = mint)]
    pub challenge: Account<'info, Challenge>,
    #[account(mut, has_one = challenge, has_one = user)]
    pub participant: Account<'info, Participant>,
    /// CHECK: the participant's warning address, which may not exist; fixed by its seeds.
    #[account(seeds = [WARNING_SEED, challenge.key().as_ref(), user.key().as_ref()], bump)]
    pub warning: UncheckedAccount<'info>,
    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = user,
        token::token_program = token_program,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = challenge,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_claim(ctx: Context<Claim>) -> Result<()> {
    let challenge = &mut ctx.accounts.challenge;
    let participant = &mut ctx.accounts.participant;
    let config = track_config(challenge.track).ok_or(ErrorCode::InvalidTrack)?;

    require!(challenge.finalized, ErrorCode::NotFinalized);
    require!(!participant.claimed, ErrorCode::AlreadyClaimed);
    require!(
        Clock::get()?.unix_timestamp < challenge.claim_deadline()?,
        ErrorCode::ClaimWindowClosed
    );
    require!(
        participant.days_completed == config.full_mask()
            && Warning::count_at(&ctx.accounts.warning)? < MAX_WARNINGS,
        ErrorCode::NotAWinner
    );

    // share of the prize pool, rounded down to 0.01 USDC
    let payout = (challenge.prize_pool()? as u128)
        .checked_mul(u128::from(participant.multiply))
        .ok_or(ErrorCode::MathOverflow)?
        / u128::from(challenge.winner_shares);
    let payout = u64::try_from(payout).map_err(|_| ErrorCode::MathOverflow)? / PAYOUT_UNIT * PAYOUT_UNIT;

    participant.claimed = true;
    challenge.claimed_count = challenge.claimed_count.checked_add(1).ok_or(ErrorCode::MathOverflow)?;

    let track = [challenge.track];
    let challenge_id = challenge.challenge_id.to_le_bytes();
    let seeds: &[&[u8]] = &[CHALLENGE_SEED, &track, &challenge_id, &[challenge.bump]];
    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: challenge.to_account_info(),
            },
            &[seeds],
        ),
        payout,
        ctx.accounts.mint.decimals,
    )
}
