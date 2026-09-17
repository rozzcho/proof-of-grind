use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Challenge, DiscordLink, Participant, ParticipationLock},
};

#[derive(Accounts)]
#[instruction(track: u8, challenge_id: u64, discord_id: u64)]
pub struct Register<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(address = VERIFIER @ ErrorCode::InvalidVerifier)]
    pub verifier: Signer<'info>,
    // The first registrant creates the challenge; its terms come from constants, so it is
    // identical no matter who creates it.
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + Challenge::INIT_SPACE,
        seeds = [CHALLENGE_SEED, &[track], &challenge_id.to_le_bytes()],
        bump
    )]
    pub challenge: Box<Account<'info, Challenge>>,
    // `init` fails if this wallet already registered for the challenge.
    #[account(
        init,
        payer = user,
        space = 8 + Participant::INIT_SPACE,
        seeds = [PARTICIPANT_SEED, challenge.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub participant: Box<Account<'info, Participant>>,
    // `init` fails if this Discord account already joined the challenge.
    #[account(
        init,
        payer = user,
        space = 8 + DiscordLink::INIT_SPACE,
        seeds = [DISCORD_SEED, challenge.key().as_ref(), &discord_id.to_le_bytes()],
        bump
    )]
    pub discord_link: Box<Account<'info, DiscordLink>>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + ParticipationLock::INIT_SPACE,
        seeds = [WALLET_LOCK_SEED, user.key().as_ref()],
        bump
    )]
    pub wallet_lock: Box<Account<'info, ParticipationLock>>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + ParticipationLock::INIT_SPACE,
        seeds = [DISCORD_LOCK_SEED, &discord_id.to_le_bytes()],
        bump
    )]
    pub discord_lock: Box<Account<'info, ParticipationLock>>,
    #[account(address = USDC_MINT, mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = user,
        token::token_program = token_program,
    )]
    pub user_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint,
        associated_token::authority = challenge,
        associated_token::token_program = token_program,
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_register(
    ctx: Context<Register>,
    track: u8,
    challenge_id: u64,
    discord_id: u64,
    multiply: u8,
) -> Result<()> {
    let config = track_config(track).ok_or(ErrorCode::InvalidTrack)?;
    require!((1..=MAX_MULTIPLY).contains(&multiply), ErrorCode::InvalidMultiply);

    let start_ts = i64::try_from(challenge_id)
        .ok()
        .and_then(|id| id.checked_mul(config.duration))
        .and_then(|offset| offset.checked_add(config.launch_ts))
        .ok_or(ErrorCode::MathOverflow)?;
    let end_ts = start_ts.checked_add(config.duration).ok_or(ErrorCode::MathOverflow)?;

    // Only the next challenge takes registrations: from when the previous one starts until this one starts.
    let now = Clock::get()?.unix_timestamp;
    require!(
        now < start_ts && now >= start_ts - config.duration,
        ErrorCode::RegistrationClosed
    );

    // Neither this wallet nor this Discord account may be in another track's challenge at the same time.
    let wallet_bump = ctx.bumps.wallet_lock;
    ctx.accounts.wallet_lock.claim(track, start_ts, end_ts, wallet_bump)?;
    let discord_bump = ctx.bumps.discord_lock;
    ctx.accounts.discord_lock.claim(track, start_ts, end_ts, discord_bump)?;

    let challenge = &mut ctx.accounts.challenge;
    if challenge.start_ts == 0 {
        challenge.set_inner(Challenge {
            track,
            challenge_id,
            mint: ctx.accounts.mint.key(),
            entry_fee: config.entry_fee,
            start_ts,
            end_ts,
            participant_count: 0,
            total_shares: 0,
            total_deposited: 0,
            carry_over: 0,
            winner_shares: 0,
            winner_count: 0,
            tallied_count: 0,
            claimed_count: 0,
            finalized: false,
            rolled_over: false,
            bump: ctx.bumps.challenge,
        });
    }

    let amount = challenge
        .entry_fee
        .checked_mul(u64::from(multiply))
        .ok_or(ErrorCode::MathOverflow)?;

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
        amount,
        ctx.accounts.mint.decimals,
    )?;

    let challenge = &mut ctx.accounts.challenge;
    challenge.participant_count = challenge
        .participant_count
        .checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;
    challenge.total_shares = challenge
        .total_shares
        .checked_add(u64::from(multiply))
        .ok_or(ErrorCode::MathOverflow)?;
    challenge.total_deposited = challenge
        .total_deposited
        .checked_add(amount)
        .ok_or(ErrorCode::MathOverflow)?;

    ctx.accounts.participant.set_inner(Participant {
        challenge: challenge.key(),
        user: ctx.accounts.user.key(),
        discord_id,
        multiply,
        amount_paid: amount,
        registered_at: now,
        days_completed: 0,
        tallied: false,
        claimed: false,
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
