use {
    anchor_lang::{
        prelude::{Clock, Pubkey},
        solana_program::instruction::Instruction,
        system_program, AccountDeserialize, InstructionData, ToAccountMetas,
    },
    anchor_spl::{associated_token, token},
    litesvm::LiteSVM,
    proof_of_grind::{
        constants::{
            CHALLENGE_SEED, DISCORD_SEED, PARTICIPANT_SEED, TRACK_WEEKLY, USDC_MINT, VERIFIER, WEEKLY_ENTRY_FEE,
            WEEKLY_LAUNCH_TS, WEEK_SECONDS,
        },
        state::{Challenge, DiscordLink, Participant},
    },
    solana_account::Account,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

const USDC: u64 = 1_000_000;
const DAY: i64 = 24 * 60 * 60;

struct Env {
    svm: LiteSVM,
    verifier: Keypair,
}

fn setup(now: i64) -> Env {
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/proof_of_grind.so"));
    svm.add_program(proof_of_grind::id(), bytes).unwrap();

    let verifier = load_keypair(concat!(env!("CARGO_MANIFEST_DIR"), "/../../server/.keys/verifier.json"));
    assert_eq!(verifier.pubkey(), VERIFIER, "server/.keys/verifier.json must match VERIFIER");

    set_mint(&mut svm, &USDC_MINT, 6);
    set_time(&mut svm, now);
    Env { svm, verifier }
}

fn set_time(svm: &mut LiteSVM, now: i64) {
    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp = now;
    svm.set_sysvar(&clock);
}

fn load_keypair(path: &str) -> Keypair {
    let data = std::fs::read_to_string(path).unwrap_or_else(|_| panic!("missing {path}"));
    let bytes: Vec<u8> = data
        .trim()
        .trim_start_matches('[')
        .trim_end_matches(']')
        .split(',')
        .map(|n| n.trim().parse().unwrap())
        .collect();
    Keypair::try_from(bytes.as_slice()).unwrap()
}

fn set_mint(svm: &mut LiteSVM, mint: &Pubkey, decimals: u8) {
    // spl-token Mint layout (82 bytes)
    let mut data = vec![0u8; 82];
    data[44] = decimals;
    data[45] = 1; // is_initialized
    svm.set_account(
        *mint,
        Account { lamports: 1_461_600, data, owner: token::ID, executable: false, rent_epoch: 0 },
    )
    .unwrap();
}

fn set_token_account(svm: &mut LiteSVM, address: &Pubkey, mint: &Pubkey, owner: &Pubkey, amount: u64) {
    // spl-token Account layout (165 bytes)
    let mut data = vec![0u8; 165];
    data[0..32].copy_from_slice(mint.as_ref());
    data[32..64].copy_from_slice(owner.as_ref());
    data[64..72].copy_from_slice(&amount.to_le_bytes());
    data[108] = 1; // state = Initialized
    svm.set_account(
        *address,
        Account { lamports: 2_039_280, data, owner: token::ID, executable: false, rent_epoch: 0 },
    )
    .unwrap();
}

fn token_amount(svm: &LiteSVM, address: &Pubkey) -> u64 {
    let acc = svm.get_account(address).unwrap();
    u64::from_le_bytes(acc.data[64..72].try_into().unwrap())
}

fn ata(owner: &Pubkey) -> Pubkey {
    associated_token::get_associated_token_address(owner, &USDC_MINT)
}

fn challenge_pda(track: u8, id: u64) -> Pubkey {
    Pubkey::find_program_address(&[CHALLENGE_SEED, &[track], &id.to_le_bytes()], &proof_of_grind::id()).0
}

fn participant_pda(challenge: &Pubkey, user: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[PARTICIPANT_SEED, challenge.as_ref(), user.as_ref()], &proof_of_grind::id()).0
}

fn discord_link_pda(challenge: &Pubkey, discord_id: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[DISCORD_SEED, challenge.as_ref(), &discord_id.to_le_bytes()],
        &proof_of_grind::id(),
    )
    .0
}

/// First signer pays fees.
fn send(svm: &mut LiteSVM, ix: Instruction, signers: &[&Keypair]) -> Result<(), String> {
    svm.expire_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&signers[0].pubkey()), &svm.latest_blockhash());
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?}", e.err))
}

struct Reg {
    track: u8,
    challenge_id: u64,
    discord_id: u64,
    multiply: u8,
}

fn weekly(challenge_id: u64, discord_id: u64, multiply: u8) -> Reg {
    Reg { track: TRACK_WEEKLY, challenge_id, discord_id, multiply }
}

fn register_ix(user: &Pubkey, verifier: &Pubkey, r: &Reg) -> Instruction {
    let challenge = challenge_pda(r.track, r.challenge_id);
    Instruction::new_with_bytes(
        proof_of_grind::id(),
        &proof_of_grind::instruction::Register {
            track: r.track,
            challenge_id: r.challenge_id,
            discord_id: r.discord_id,
            multiply: r.multiply,
        }
        .data(),
        proof_of_grind::accounts::Register {
            user: *user,
            verifier: *verifier,
            challenge,
            participant: participant_pda(&challenge, user),
            discord_link: discord_link_pda(&challenge, r.discord_id),
            mint: USDC_MINT,
            user_token_account: ata(user),
            vault: ata(&challenge),
            token_program: token::ID,
            associated_token_program: associated_token::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn new_user(svm: &mut LiteSVM, usdc: u64) -> Keypair {
    let user = Keypair::new();
    svm.airdrop(&user.pubkey(), 1_000_000_000).unwrap();
    set_token_account(svm, &ata(&user.pubkey()), &USDC_MINT, &user.pubkey(), usdc);
    user
}

fn register(env: &mut Env, user: &Keypair, r: &Reg) -> Result<(), String> {
    let ix = register_ix(&user.pubkey(), &env.verifier.pubkey(), r);
    let verifier = env.verifier.insecure_clone();
    send(&mut env.svm, ix, &[user, &verifier])
}

fn challenge_state(svm: &LiteSVM, id: u64) -> Challenge {
    let acc = svm.get_account(&challenge_pda(TRACK_WEEKLY, id)).unwrap();
    Challenge::try_deserialize(&mut acc.data.as_slice()).unwrap()
}

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
