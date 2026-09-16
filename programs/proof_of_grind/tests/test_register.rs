mod common;

use {
    common::*,
    proof_of_grind::{
        constants::{TRACK_WEEKLY, WEEKLY_ENTRY_FEE, WEEKLY_LAUNCH_TS, WEEK_SECONDS},
        state::{DiscordLink, Participant},
    },
    anchor_lang::AccountDeserialize,
    solana_keypair::Keypair,
    solana_signer::Signer,
};

/// A day before Weekly #0 starts: registration for #0 is open.
const BEFORE_LAUNCH: i64 = WEEKLY_LAUNCH_TS - DAY;

#[test]
fn first_registration_creates_the_challenge() {
    let mut env = setup(BEFORE_LAUNCH);
    let user = new_user(&mut env.svm, 10 * USDC);
    register(&mut env, &user, &weekly(0, 111, 1)).unwrap();

    let challenge = challenge_pda(TRACK_WEEKLY, 0);
    assert_eq!(token_amount(&env.svm, &ata(&challenge)), 7 * USDC);
    assert_eq!(token_amount(&env.svm, &ata(&user.pubkey())), 3 * USDC);

    let state = challenge_state(&env.svm, 0);
    assert_eq!(state.start_ts, WEEKLY_LAUNCH_TS);
    assert_eq!(state.end_ts, WEEKLY_LAUNCH_TS + WEEK_SECONDS);
    assert_eq!(state.entry_fee, WEEKLY_ENTRY_FEE);
    assert_eq!(state.participant_count, 1);
    assert_eq!(state.total_shares, 1);

    let acc = env.svm.get_account(&participant_pda(&challenge, &user.pubkey())).unwrap();
    let p = Participant::try_deserialize(&mut acc.data.as_slice()).unwrap();
    assert_eq!((p.discord_id, p.multiply, p.amount_paid), (111, 1, 7 * USDC));

    let acc = env.svm.get_account(&discord_link_pda(&challenge, 111)).unwrap();
    let link = DiscordLink::try_deserialize(&mut acc.data.as_slice()).unwrap();
    assert_eq!(link.user, user.pubkey());
}

#[test]
fn multiply_scales_payment_and_shares() {
    let mut env = setup(BEFORE_LAUNCH);
    let a = new_user(&mut env.svm, 100 * USDC);
    let b = new_user(&mut env.svm, 100 * USDC);
    register(&mut env, &a, &weekly(0, 1, 5)).unwrap();
    register(&mut env, &b, &weekly(0, 2, 10)).unwrap();

    assert_eq!(token_amount(&env.svm, &ata(&a.pubkey())), 65 * USDC);
    assert_eq!(token_amount(&env.svm, &ata(&b.pubkey())), 30 * USDC);
    let state = challenge_state(&env.svm, 0);
    assert_eq!(state.participant_count, 2);
    assert_eq!(state.total_shares, 15);
    assert_eq!(state.total_deposited, 105 * USDC);
    assert_eq!(token_amount(&env.svm, &ata(&challenge_pda(TRACK_WEEKLY, 0))), 105 * USDC);
}

#[test]
fn multiply_out_of_range_fails() {
    let mut env = setup(BEFORE_LAUNCH);
    let user = new_user(&mut env.svm, 100 * USDC);
    assert!(register(&mut env, &user, &weekly(0, 1, 0)).is_err());
    assert!(register(&mut env, &user, &weekly(0, 1, 11)).is_err());
}

#[test]
fn registration_rolls_over_to_next_week_at_start() {
    let mut env = setup(WEEKLY_LAUNCH_TS); // #0 has just started
    let user = new_user(&mut env.svm, 100 * USDC);
    assert!(register(&mut env, &user, &weekly(0, 1, 1)).is_err(), "#0 is closed");
    register(&mut env, &user, &weekly(1, 1, 1)).unwrap();
    assert_eq!(challenge_state(&env.svm, 1).start_ts, WEEKLY_LAUNCH_TS + WEEK_SECONDS);
}

#[test]
fn future_challenge_is_not_open_yet() {
    let mut env = setup(BEFORE_LAUNCH);
    let user = new_user(&mut env.svm, 100 * USDC);
    assert!(register(&mut env, &user, &weekly(1, 1, 1)).is_err());
}

#[test]
fn same_wallet_twice_fails() {
    let mut env = setup(BEFORE_LAUNCH);
    let user = new_user(&mut env.svm, 100 * USDC);
    register(&mut env, &user, &weekly(0, 1, 1)).unwrap();
    assert!(register(&mut env, &user, &weekly(0, 2, 1)).is_err());
}

#[test]
fn same_discord_account_twice_fails() {
    let mut env = setup(BEFORE_LAUNCH);
    let first = new_user(&mut env.svm, 10 * USDC);
    let second = new_user(&mut env.svm, 10 * USDC);
    register(&mut env, &first, &weekly(0, 42, 1)).unwrap();
    assert!(register(&mut env, &second, &weekly(0, 42, 1)).is_err());
    assert_eq!(token_amount(&env.svm, &ata(&second.pubkey())), 10 * USDC);
}

#[test]
fn register_without_verifier_signature_fails() {
    let mut env = setup(BEFORE_LAUNCH);
    let user = new_user(&mut env.svm, 10 * USDC);
    let fake = Keypair::new();
    let ix = register_ix(&user.pubkey(), &fake.pubkey(), &weekly(0, 1, 1));
    assert!(send(&mut env.svm, ix, &[&user, &fake]).is_err());
    assert!(env.svm.get_account(&challenge_pda(TRACK_WEEKLY, 0)).is_none());
}

#[test]
fn not_enough_usdc_for_multiply_fails() {
    let mut env = setup(BEFORE_LAUNCH);
    let user = new_user(&mut env.svm, 35 * USDC - 1);
    assert!(register(&mut env, &user, &weekly(0, 1, 5)).is_err());
    assert!(env.svm.get_account(&participant_pda(&challenge_pda(TRACK_WEEKLY, 0), &user.pubkey())).is_none());
}

#[test]
fn non_weekly_track_fails() {
    let mut env = setup(BEFORE_LAUNCH);
    let user = new_user(&mut env.svm, 100 * USDC);
    let r = Reg { track: 1, challenge_id: 0, discord_id: 1, multiply: 1 };
    assert!(register(&mut env, &user, &r).is_err());
}
