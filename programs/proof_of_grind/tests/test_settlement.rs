mod common;

use {
    anchor_lang::prelude::Pubkey,
    common::*,
    proof_of_grind::constants::{track_config, CLAIM_WINDOW_SECONDS, RECORD_WINDOW_SECONDS, TRACK_BIWEEKLY, TRACK_TEST, TRACK_WEEKLY, USDC_MINT, WEEKLY_LAUNCH_TS, WEEK_SECONDS},
    solana_keypair::Keypair,
    solana_signer::Signer,
};

const BEFORE_LAUNCH: i64 = WEEKLY_LAUNCH_TS - DAY;
/// Weekly #0 has ended and its record window has closed: results can be tallied.
const AFTER_END: i64 = WEEKLY_LAUNCH_TS + WEEK_SECONDS + RECORD_WINDOW_SECONDS;

struct Player {
    keypair: Keypair,
    multiply: u8,
}

/// Registers `multiplies.len()` players for Weekly #0 and returns them.
fn register_players(env: &mut Env, multiplies: &[u8]) -> (Pubkey, Vec<Player>) {
    let challenge = challenge_pda(TRACK_WEEKLY, 0);
    let players = multiplies
        .iter()
        .enumerate()
        .map(|(i, &multiply)| {
            let keypair = new_user(&mut env.svm, 200 * USDC);
            let reg = weekly(0, 1000 + i as u64, multiply);
            register(env, &keypair, &reg).unwrap();
            Player { keypair, multiply }
        })
        .collect();
    (challenge, players)
}

fn tally_all(env: &mut Env, challenge: &Pubkey, players: &[Player]) {
    let payer = new_user(&mut env.svm, 0);
    for player in players {
        let ix = tally_ix(challenge, &player.keypair.pubkey());
        send(&mut env.svm, ix, &[&payer]).unwrap();
    }
}

#[test]
fn winners_split_the_prize_pool_by_multiply() {
    let mut env = setup(BEFORE_LAUNCH);
    let (challenge, players) = register_players(&mut env, &[1, 5, 10]);
    // entry pool = (1 + 5 + 10) x 7 = 112 USDC, prize pool = 106.4 USDC
    assert_eq!(token_amount(&env.svm, &ata(&challenge)), 112 * USDC);

    // the 1x and the 10x pass every day; the 5x misses the last one
    complete_all_days(&mut env, &challenge, &players[0].keypair.pubkey(), TRACK_WEEKLY);
    complete_all_days(&mut env, &challenge, &players[2].keypair.pubkey(), TRACK_WEEKLY);
    for day in 0..track_config(TRACK_WEEKLY).unwrap().days - 1 {
        set_time(&mut env.svm, WEEKLY_LAUNCH_TS + i64::from(day) * DAY + 1);
        let verifier = env.verifier.insecure_clone();
        let ix = record_progress_ix(&verifier.pubkey(), &challenge, &players[1].keypair.pubkey(), day);
        send(&mut env.svm, ix, &[&verifier]).unwrap();
    }

    set_time(&mut env.svm, AFTER_END);
    tally_all(&mut env, &challenge, &players);

    let state = challenge_state(&env.svm, 0);
    assert!(state.finalized);
    assert_eq!(state.winner_count, 2);
    assert_eq!(state.winner_shares, 11);

    // prize pool 106.4 USDC over 11 shares: 1x gets 9.67, 10x gets 96.72 (rounded down to 0.01)
    for (player, expected) in [(&players[0], 9_670_000u64), (&players[2], 96_720_000)] {
        let user = player.keypair.pubkey();
        let before = token_amount(&env.svm, &ata(&user));
        let keypair = player.keypair.insecure_clone();
        send(&mut env.svm, claim_ix(&challenge, &user), &[&keypair]).unwrap();
        assert_eq!(token_amount(&env.svm, &ata(&user)) - before, expected, "payout for {}x", player.multiply);
    }
    assert_eq!(challenge_state(&env.svm, 0).claimed_count, 2);
}

#[test]
fn losers_cannot_claim_and_winners_claim_once() {
    let mut env = setup(BEFORE_LAUNCH);
    let (challenge, players) = register_players(&mut env, &[1, 2]);

    complete_all_days(&mut env, &challenge, &players[0].keypair.pubkey(), TRACK_WEEKLY);

    set_time(&mut env.svm, AFTER_END);
    tally_all(&mut env, &challenge, &players);

    let winner = players[0].keypair.insecure_clone();
    let loser = players[1].keypair.insecure_clone();
    assert!(send(&mut env.svm, claim_ix(&challenge, &loser.pubkey()), &[&loser]).is_err());
    send(&mut env.svm, claim_ix(&challenge, &winner.pubkey()), &[&winner]).unwrap();
    assert!(send(&mut env.svm, claim_ix(&challenge, &winner.pubkey()), &[&winner]).is_err());
}

#[test]
fn tally_and_claim_need_the_challenge_to_be_over_and_counted() {
    let mut env = setup(BEFORE_LAUNCH);
    let (challenge, players) = register_players(&mut env, &[1, 1]);
    let user = players[0].keypair.insecure_clone();

    complete_all_days(&mut env, &challenge, &user.pubkey(), TRACK_WEEKLY);
    // still running
    set_time(&mut env.svm, WEEKLY_LAUNCH_TS + DAY);
    assert!(send(&mut env.svm, tally_ix(&challenge, &user.pubkey()), &[&user]).is_err());
    // over, but days can still be recorded for a while
    set_time(&mut env.svm, AFTER_END - 1);
    assert!(send(&mut env.svm, tally_ix(&challenge, &user.pubkey()), &[&user]).is_err());

    set_time(&mut env.svm, AFTER_END);
    send(&mut env.svm, tally_ix(&challenge, &user.pubkey()), &[&user]).unwrap();
    // the other participant has not been counted yet
    assert!(!challenge_state(&env.svm, 0).finalized);
    assert!(send(&mut env.svm, claim_ix(&challenge, &user.pubkey()), &[&user]).is_err());
    // counting the same participant twice is rejected
    assert!(send(&mut env.svm, tally_ix(&challenge, &user.pubkey()), &[&user]).is_err());
}

#[test]
fn only_the_oracle_can_record_progress() {
    let mut env = setup(BEFORE_LAUNCH);
    let (challenge, players) = register_players(&mut env, &[1]);
    let user = players[0].keypair.insecure_clone();

    set_time(&mut env.svm, WEEKLY_LAUNCH_TS + DAY);
    let fake = new_user(&mut env.svm, 0);
    let ix = record_progress_ix(&fake.pubkey(), &challenge, &user.pubkey(), 0);
    assert!(send(&mut env.svm, ix, &[&fake]).is_err());
    assert_eq!(participant_state(&env.svm, &challenge, &user.pubkey()).days_completed, 0);
}

#[test]
fn progress_cannot_be_recorded_early_or_late() {
    let mut env = setup(BEFORE_LAUNCH);
    let (challenge, players) = register_players(&mut env, &[1]);
    let user = players[0].keypair.pubkey();
    let verifier = env.verifier.insecure_clone();

    // day 3 has not started yet
    set_time(&mut env.svm, WEEKLY_LAUNCH_TS + DAY);
    let ix = record_progress_ix(&verifier.pubkey(), &challenge, &user, 3);
    assert!(send(&mut env.svm, ix, &[&verifier]).is_err());

    // a day that does not exist on this track
    let ix = record_progress_ix(&verifier.pubkey(), &challenge, &user, 7);
    assert!(send(&mut env.svm, ix, &[&verifier]).is_err());

    // still inside the record window after the end
    set_time(&mut env.svm, WEEKLY_LAUNCH_TS + WEEK_SECONDS + RECORD_WINDOW_SECONDS - 1);
    let ix = record_progress_ix(&verifier.pubkey(), &challenge, &user, 0);
    send(&mut env.svm, ix, &[&verifier]).unwrap();

    // the window has closed
    set_time(&mut env.svm, WEEKLY_LAUNCH_TS + WEEK_SECONDS + RECORD_WINDOW_SECONDS);
    let ix = record_progress_ix(&verifier.pubkey(), &challenge, &user, 1);
    assert!(send(&mut env.svm, ix, &[&verifier]).is_err());
}

#[test]
fn unclaimed_pool_rolls_over_when_nobody_passes() {
    let mut env = setup(BEFORE_LAUNCH);
    let (challenge, players) = register_players(&mut env, &[1, 1]);

    // someone registers for the next challenge while this one runs, which creates it
    set_time(&mut env.svm, WEEKLY_LAUNCH_TS + DAY);
    let next_user = new_user(&mut env.svm, 50 * USDC);
    register(&mut env, &next_user, &weekly(1, 2000, 1)).unwrap();
    let next = challenge_pda(TRACK_WEEKLY, 1);

    set_time(&mut env.svm, AFTER_END);
    tally_all(&mut env, &challenge, &players);
    let state = challenge_state(&env.svm, 0);
    assert!(state.finalized);
    assert_eq!(state.winner_shares, 0);

    let payer = new_user(&mut env.svm, 0);
    send(&mut env.svm, rollover_ix(&challenge, &next), &[&payer]).unwrap();

    // 14 USDC entry pool -> 13.3 USDC prize pool moves over
    assert_eq!(token_amount(&env.svm, &ata(&next)), 7 * USDC + 13_300_000);
    let next_state = challenge_state(&env.svm, 1);
    assert_eq!(next_state.carry_over, 13_300_000);
    // prize pool of the next challenge = 95% of its own entries + the carried amount
    assert_eq!(next_state.prize_pool().unwrap(), 6_650_000 + 13_300_000);
    // rolling over twice is rejected
    assert!(send(&mut env.svm, rollover_ix(&challenge, &next), &[&payer]).is_err());
}

#[test]
fn rollover_is_rejected_when_there_are_winners() {
    let mut env = setup(BEFORE_LAUNCH);
    let (challenge, players) = register_players(&mut env, &[1]);
    let user = players[0].keypair.pubkey();

    complete_all_days(&mut env, &challenge, &user, TRACK_WEEKLY);

    set_time(&mut env.svm, WEEKLY_LAUNCH_TS + DAY);
    let next_user = new_user(&mut env.svm, 50 * USDC);
    register(&mut env, &next_user, &weekly(1, 2000, 1)).unwrap();

    set_time(&mut env.svm, AFTER_END);
    tally_all(&mut env, &challenge, &players);
    let payer = new_user(&mut env.svm, 0);
    assert!(send(&mut env.svm, rollover_ix(&challenge, &challenge_pda(TRACK_WEEKLY, 1)), &[&payer]).is_err());
}

#[test]
fn treasury_takes_the_fee_after_the_winners_are_paid() {
    let mut env = setup(BEFORE_LAUNCH);
    let (challenge, players) = register_players(&mut env, &[1, 5]);
    let treasury = load_treasury();
    env.svm.airdrop(&treasury.pubkey(), 1_000_000_000).unwrap();
    set_token_account(&mut env.svm, &ata(&treasury.pubkey()), &USDC_MINT, &treasury.pubkey(), 0);

    for player in &players {
        complete_all_days(&mut env, &challenge, &player.keypair.pubkey(), TRACK_WEEKLY);
    }
    set_time(&mut env.svm, AFTER_END);
    tally_all(&mut env, &challenge, &players);

    // fees cannot be taken while claims are pending
    assert!(send(&mut env.svm, withdraw_fees_ix(&treasury.pubkey(), &challenge), &[&treasury]).is_err());

    for player in &players {
        let keypair = player.keypair.insecure_clone();
        send(&mut env.svm, claim_ix(&challenge, &keypair.pubkey()), &[&keypair]).unwrap();
    }
    let left_in_vault = token_amount(&env.svm, &ata(&challenge));
    send(&mut env.svm, withdraw_fees_ix(&treasury.pubkey(), &challenge), &[&treasury]).unwrap();

    // 42 USDC entry pool: 2.1 USDC fee plus rounding dust
    assert_eq!(token_amount(&env.svm, &ata(&treasury.pubkey())), left_in_vault);
    assert!(left_in_vault >= 2_100_000);
    assert_eq!(token_amount(&env.svm, &ata(&challenge)), 0);
}

#[test]
fn test_track_runs_a_full_cycle_quickly() {
    let config = track_config(TRACK_TEST).unwrap();
    let start = config.duration * 100;
    let mut env = setup(start - 60);

    let user = new_user(&mut env.svm, 50 * USDC);
    let reg = Reg { track: TRACK_TEST, challenge_id: 100, discord_id: 7, multiply: 2 };
    register(&mut env, &user, &reg).unwrap();
    let challenge = challenge_pda(TRACK_TEST, 100);

    complete_all_days(&mut env, &challenge, &user.pubkey(), TRACK_TEST);

    set_time(&mut env.svm, start + config.duration + config.record_window);
    send(&mut env.svm, tally_ix(&challenge, &user.pubkey()), &[&user]).unwrap();

    let before = token_amount(&env.svm, &ata(&user.pubkey()));
    send(&mut env.svm, claim_ix(&challenge, &user.pubkey()), &[&user]).unwrap();
    // paid 2 USDC, prize pool = 1.9 USDC and they are the only winner
    assert_eq!(token_amount(&env.svm, &ata(&user.pubkey())) - before, 1_900_000);
}

#[test]
fn biweekly_track_charges_10_usdc_and_needs_all_14_days() {
    let config = track_config(TRACK_BIWEEKLY).unwrap();
    assert_eq!(config.days, 14);
    let start = config.launch_ts;
    let mut env = setup(start - 60);

    let user = new_user(&mut env.svm, 50 * USDC);
    let before_register = token_amount(&env.svm, &ata(&user.pubkey()));
    let reg = Reg { track: TRACK_BIWEEKLY, challenge_id: 0, discord_id: 11, multiply: 1 };
    register(&mut env, &user, &reg).unwrap();
    assert_eq!(before_register - token_amount(&env.svm, &ata(&user.pubkey())), 10 * USDC);
    let challenge = challenge_pda(TRACK_BIWEEKLY, 0);

    complete_all_days(&mut env, &challenge, &user.pubkey(), TRACK_BIWEEKLY);

    set_time(&mut env.svm, start + config.duration + config.record_window);
    send(&mut env.svm, tally_ix(&challenge, &user.pubkey()), &[&user]).unwrap();

    let before = token_amount(&env.svm, &ata(&user.pubkey()));
    send(&mut env.svm, claim_ix(&challenge, &user.pubkey()), &[&user]).unwrap();
    // paid 10 USDC, prize pool = 9.5 USDC and they are the only winner
    assert_eq!(token_amount(&env.svm, &ata(&user.pubkey())) - before, 9_500_000);
}

#[test]
fn claims_close_after_4_weeks_and_the_treasury_takes_the_rest() {
    let mut env = setup(BEFORE_LAUNCH);
    let (challenge, players) = register_players(&mut env, &[1, 5]);
    let treasury = load_treasury();
    env.svm.airdrop(&treasury.pubkey(), 1_000_000_000).unwrap();
    set_token_account(&mut env.svm, &ata(&treasury.pubkey()), &USDC_MINT, &treasury.pubkey(), 0);

    for player in &players {
        complete_all_days(&mut env, &challenge, &player.keypair.pubkey(), TRACK_WEEKLY);
    }
    set_time(&mut env.svm, AFTER_END);
    tally_all(&mut env, &challenge, &players);

    // The first winner claims in time; the second never does.
    let early = players[0].keypair.insecure_clone();
    send(&mut env.svm, claim_ix(&challenge, &early.pubkey()), &[&early]).unwrap();

    let end_ts = challenge_at(&env.svm, &challenge).end_ts;
    set_time(&mut env.svm, end_ts + CLAIM_WINDOW_SECONDS - 1);
    // Still inside the window: fees stay locked while a claim is pending.
    assert!(send(&mut env.svm, withdraw_fees_ix(&treasury.pubkey(), &challenge), &[&treasury]).is_err());

    set_time(&mut env.svm, end_ts + CLAIM_WINDOW_SECONDS);
    let late = players[1].keypair.insecure_clone();
    let err = send(&mut env.svm, claim_ix(&challenge, &late.pubkey()), &[&late]).unwrap_err();
    assert!(err.contains("Custom(6017)"), "{err}");

    let left_in_vault = token_amount(&env.svm, &ata(&challenge));
    send(&mut env.svm, withdraw_fees_ix(&treasury.pubkey(), &challenge), &[&treasury]).unwrap();
    assert_eq!(token_amount(&env.svm, &ata(&treasury.pubkey())), left_in_vault);
    assert_eq!(token_amount(&env.svm, &ata(&challenge)), 0);
}

#[test]
fn three_warnings_knock_a_participant_out() {
    let mut env = setup(BEFORE_LAUNCH);
    let (challenge, players) = register_players(&mut env, &[1, 1]);
    let verifier = env.verifier.insecure_clone();
    let cheater = players[0].keypair.insecure_clone();
    let honest = players[1].keypair.insecure_clone();

    for player in &players {
        complete_all_days(&mut env, &challenge, &player.keypair.pubkey(), TRACK_WEEKLY);
    }
    // Only the server can give warnings.
    let err = send(&mut env.svm, add_warning_ix(&cheater.pubkey(), &challenge, &honest.pubkey()), &[&cheater]);
    assert!(err.is_err());

    for _ in 0..3 {
        send(&mut env.svm, add_warning_ix(&verifier.pubkey(), &challenge, &cheater.pubkey()), &[&verifier]).unwrap();
    }
    // Two warnings are not enough to be out.
    for _ in 0..2 {
        send(&mut env.svm, add_warning_ix(&verifier.pubkey(), &challenge, &honest.pubkey()), &[&verifier]).unwrap();
    }

    set_time(&mut env.svm, AFTER_END);
    // No more warnings once results are open.
    assert!(send(&mut env.svm, add_warning_ix(&verifier.pubkey(), &challenge, &honest.pubkey()), &[&verifier]).is_err());
    tally_all(&mut env, &challenge, &players);

    let state = challenge_state(&env.svm, 0);
    assert_eq!((state.winner_count, state.winner_shares), (1, 1));
    assert!(send(&mut env.svm, claim_ix(&challenge, &cheater.pubkey()), &[&cheater]).is_err());

    // The honest winner takes the whole prize pool: 14 USDC entry pool -> 13.3 USDC.
    let before = token_amount(&env.svm, &ata(&honest.pubkey()));
    send(&mut env.svm, claim_ix(&challenge, &honest.pubkey()), &[&honest]).unwrap();
    assert_eq!(token_amount(&env.svm, &ata(&honest.pubkey())) - before, 13_300_000);
}
