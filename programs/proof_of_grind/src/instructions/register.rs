use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Challenge, DiscordLink, Participant},
};

#[derive(Accounts)]
#[instruction(discord_id: u64)]
pub struct Register<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(address = VERIFIER @ ErrorCode::InvalidVerifier)]
    pub verifier: Signer<'info>,
    #[account(
        mut,
        seeds = [CHALLENGE_SEED, &[challenge.track], &challenge.challenge_id.to_le_bytes()],
        bump = challenge.bump,
        has_one = mint,
    )]
    pub challenge: Account<'info, Challenge>,
    // `init` fails if this user already registered for the challenge.
    #[account(
        init,
        payer = user,
        space = 8 + Participant::INIT_SPACE,
        seeds = [PARTICIPANT_SEED, challenge.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub participant: Account<'info, Participant>,
    // `init` fails if this Discord account already joined the challenge.
    #[account(
        init,
        payer = user,
        space = 8 + DiscordLink::INIT_SPACE,
        seeds = [DISCORD_SEED, challenge.key().as_ref(), &discord_id.to_le_bytes()],
        bump
    )]
    pub discord_link: Account<'info, DiscordLink>,
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
    pub system_program: Program<'info, System>,
}

pub fn handle_register(ctx: Context<Register>, discord_id: u64) -> Result<()> {
    let entry_fee = ctx.accounts.challenge.entry_fee;

    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.user_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        entry_fee,
        ctx.accounts.mint.decimals,
    )?;

    let challenge = &mut ctx.accounts.challenge;
    challenge.participant_count = challenge
        .participant_count
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;
    challenge.total_deposited = challenge
        .total_deposited
        .checked_add(entry_fee)
        .ok_or(ErrorCode::MathOverflow)?;

    ctx.accounts.participant.set_inner(Participant {
        challenge: challenge.key(),
        user: ctx.accounts.user.key(),
        discord_id,
        amount_paid: entry_fee,
        registered_at: Clock::get()?.unix_timestamp,
        bump: ctx.bumps.participant,
    });
    ctx.accounts.discord_link.set_inner(DiscordLink {
        challenge: challenge.key(),
        discord_id,
        user: ctx.accounts.user.key(),
        bump: ctx.bumps.discord_link,
    });
    Ok(())
}
