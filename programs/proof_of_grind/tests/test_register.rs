use {
    anchor_lang::{
        prelude::Pubkey, solana_program::instruction::Instruction, system_program,
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    anchor_spl::{associated_token, token},
    litesvm::LiteSVM,
    proof_of_grind::{
        constants::{
            ADMIN, CHALLENGE_SEED, DISCORD_SEED, PARTICIPANT_SEED, TRACK_WEEKLY, USDC_MINT, VERIFIER,
        },
        state::{Challenge, DiscordLink, Participant},
    },
    solana_account::Account,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

const ENTRY_FEE: u64 = 7_000_000;
const DISCORD_ID: u64 = 123_456_789_012_345_678;

struct Env {
    svm: LiteSVM,
    admin: Keypair,
    verifier: Keypair,
}

fn setup() -> Env {
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/proof_of_grind.so"
    ));
    svm.add_program(proof_of_grind::id(), bytes).unwrap();

    // Local CLI wallet is the program's ADMIN; the server key is the VERIFIER.
    let admin = load_keypair(&(std::env::var("HOME").unwrap() + "/.config/solana/id.json"));
    assert_eq!(admin.pubkey(), ADMIN, "CLI wallet must match ADMIN");
    let verifier = load_keypair(concat!(env!("CARGO_MANIFEST_DIR"), "/../../server/.keys/verifier.json"));
    assert_eq!(verifier.pubkey(), VERIFIER, "server/.keys/verifier.json must match VERIFIER");

    svm.airdrop(&admin.pubkey(), 10_000_000_000).unwrap();
    set_mint(&mut svm, &USDC_MINT, 6);
    Env { svm, admin, verifier }
}

fn load_keypair(path: &str) -> Keypair {
    let data = std::fs::read_to_string(path).unwrap_or_else(|_| panic!("missing {path}"));
    Keypair::try_from(serde_json_bytes(&data).as_slice()).unwrap()
}

fn serde_json_bytes(s: &str) -> Vec<u8> {
    s.trim()
        .trim_start_matches('[')
        .trim_end_matches(']')
        .split(',')
        .map(|n| n.trim().parse().unwrap())
        .collect()
}

fn set_mint(svm: &mut LiteSVM, mint: &Pubkey, decimals: u8) {
    // spl-token Mint layout (82 bytes)
    let mut data = vec![0u8; 82];
    data[44] = decimals;
    data[45] = 1; // is_initialized
    svm.set_account(
        *mint,
        Account {
            lamports: 1_461_600,
            data,
            owner: token::ID,
            executable: false,
            rent_epoch: 0,
        },
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
        Account {
            lamports: 2_039_280,
            data,
            owner: token::ID,
            executable: false,
            rent_epoch: 0,
        },
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
    Pubkey::find_program_address(
        &[CHALLENGE_SEED, &[track], &id.to_le_bytes()],
        &proof_of_grind::id(),
    )
    .0
}

fn participant_pda(challenge: &Pubkey, user: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[PARTICIPANT_SEED, challenge.as_ref(), user.as_ref()],
        &proof_of_grind::id(),
    )
    .0
}

fn discord_link_pda(challenge: &Pubkey, discord_id: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[DISCORD_SEED, challenge.as_ref(), &discord_id.to_le_bytes()],
        &proof_of_grind::id(),
    )
    .0
}

fn send(svm: &mut LiteSVM, ix: Instruction, signer: &Keypair) -> Result<(), String> {
    send_multi(svm, ix, &[signer])
}

/// First signer pays fees.
fn send_multi(svm: &mut LiteSVM, ix: Instruction, signers: &[&Keypair]) -> Result<(), String> {
    svm.expire_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&signers[0].pubkey()), &svm.latest_blockhash());
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?}", e.err))
}

fn create_challenge_ix(authority: &Pubkey, track: u8, id: u64) -> Instruction {
    let challenge = challenge_pda(track, id);
    Instruction::new_with_bytes(
        proof_of_grind::id(),
        &proof_of_grind::instruction::CreateChallenge {
            track,
            challenge_id: id,
            entry_fee: ENTRY_FEE,
        }
        .data(),
        proof_of_grind::accounts::CreateChallenge {
            authority: *authority,
            challenge,
            mint: USDC_MINT,
            vault: ata(&challenge),
            token_program: token::ID,
            associated_token_program: associated_token::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn register_ix(user: &Pubkey, verifier: &Pubkey, challenge: &Pubkey, discord_id: u64) -> Instruction {
    Instruction::new_with_bytes(
        proof_of_grind::id(),
        &proof_of_grind::instruction::Register { discord_id }.data(),
        proof_of_grind::accounts::Register {
            user: *user,
            verifier: *verifier,
            challenge: *challenge,
            participant: participant_pda(challenge, user),
            discord_link: discord_link_pda(challenge, discord_id),
            mint: USDC_MINT,
            user_token_account: ata(user),
            vault: ata(challenge),
            token_program: token::ID,
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

#[test]
fn register_deposits_entry_fee_into_vault() {
    let Env { mut svm, admin, verifier } = setup();
    let challenge = challenge_pda(TRACK_WEEKLY, 0);
    send(&mut svm, create_challenge_ix(&admin.pubkey(), TRACK_WEEKLY, 0), &admin).unwrap();

    let user = new_user(&mut svm, 10_000_000);
    let ix = register_ix(&user.pubkey(), &verifier.pubkey(), &challenge, DISCORD_ID);
    send_multi(&mut svm, ix, &[&user, &verifier]).unwrap();

    assert_eq!(token_amount(&svm, &ata(&challenge)), ENTRY_FEE);
    assert_eq!(token_amount(&svm, &ata(&user.pubkey())), 3_000_000);

    let acc = svm.get_account(&challenge).unwrap();
    let state = Challenge::try_deserialize(&mut acc.data.as_slice()).unwrap();
    assert_eq!(state.participant_count, 1);
    assert_eq!(state.total_deposited, ENTRY_FEE);

    let acc = svm.get_account(&participant_pda(&challenge, &user.pubkey())).unwrap();
    let p = Participant::try_deserialize(&mut acc.data.as_slice()).unwrap();
    assert_eq!(p.user, user.pubkey());
    assert_eq!(p.discord_id, DISCORD_ID);
    assert_eq!(p.amount_paid, ENTRY_FEE);

    let acc = svm.get_account(&discord_link_pda(&challenge, DISCORD_ID)).unwrap();
    let link = DiscordLink::try_deserialize(&mut acc.data.as_slice()).unwrap();
    assert_eq!(link.user, user.pubkey());
    assert_eq!(link.discord_id, DISCORD_ID);
}

#[test]
fn same_wallet_twice_fails() {
    let Env { mut svm, admin, verifier } = setup();
    let challenge = challenge_pda(TRACK_WEEKLY, 0);
    send(&mut svm, create_challenge_ix(&admin.pubkey(), TRACK_WEEKLY, 0), &admin).unwrap();

    let user = new_user(&mut svm, 20_000_000);
    let ix = register_ix(&user.pubkey(), &verifier.pubkey(), &challenge, DISCORD_ID);
    send_multi(&mut svm, ix, &[&user, &verifier]).unwrap();
    let ix = register_ix(&user.pubkey(), &verifier.pubkey(), &challenge, DISCORD_ID + 1);
    assert!(send_multi(&mut svm, ix, &[&user, &verifier]).is_err());
    assert_eq!(token_amount(&svm, &ata(&challenge)), ENTRY_FEE);
}

#[test]
fn same_discord_account_twice_fails() {
    let Env { mut svm, admin, verifier } = setup();
    let challenge = challenge_pda(TRACK_WEEKLY, 0);
    send(&mut svm, create_challenge_ix(&admin.pubkey(), TRACK_WEEKLY, 0), &admin).unwrap();

    let first = new_user(&mut svm, 10_000_000);
    let ix = register_ix(&first.pubkey(), &verifier.pubkey(), &challenge, DISCORD_ID);
    send_multi(&mut svm, ix, &[&first, &verifier]).unwrap();

    let second = new_user(&mut svm, 10_000_000);
    let ix = register_ix(&second.pubkey(), &verifier.pubkey(), &challenge, DISCORD_ID);
    assert!(send_multi(&mut svm, ix, &[&second, &verifier]).is_err());
    assert_eq!(token_amount(&svm, &ata(&second.pubkey())), 10_000_000);
}

#[test]
fn register_without_verifier_signature_fails() {
    let Env { mut svm, admin, .. } = setup();
    let challenge = challenge_pda(TRACK_WEEKLY, 0);
    send(&mut svm, create_challenge_ix(&admin.pubkey(), TRACK_WEEKLY, 0), &admin).unwrap();

    let user = new_user(&mut svm, 10_000_000);
    let fake = Keypair::new();
    let ix = register_ix(&user.pubkey(), &fake.pubkey(), &challenge, DISCORD_ID);
    assert!(send_multi(&mut svm, ix, &[&user, &fake]).is_err());
    assert!(svm.get_account(&participant_pda(&challenge, &user.pubkey())).is_none());
}

#[test]
fn register_without_enough_usdc_fails() {
    let Env { mut svm, admin, verifier } = setup();
    let challenge = challenge_pda(TRACK_WEEKLY, 0);
    send(&mut svm, create_challenge_ix(&admin.pubkey(), TRACK_WEEKLY, 0), &admin).unwrap();

    let user = new_user(&mut svm, 6_999_999);
    let ix = register_ix(&user.pubkey(), &verifier.pubkey(), &challenge, DISCORD_ID);
    assert!(send_multi(&mut svm, ix, &[&user, &verifier]).is_err());
    assert!(svm.get_account(&participant_pda(&challenge, &user.pubkey())).is_none());
}

#[test]
fn non_admin_cannot_create_challenge() {
    let Env { mut svm, .. } = setup();
    let other = Keypair::new();
    svm.airdrop(&other.pubkey(), 10_000_000_000).unwrap();
    assert!(send(&mut svm, create_challenge_ix(&other.pubkey(), TRACK_WEEKLY, 0), &other).is_err());
}

#[test]
fn invalid_track_fails() {
    let Env { mut svm, admin, .. } = setup();
    assert!(send(&mut svm, create_challenge_ix(&admin.pubkey(), 2, 0), &admin).is_err());
}
