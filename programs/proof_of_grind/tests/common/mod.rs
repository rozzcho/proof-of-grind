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
            track_config, CHALLENGE_SEED, DISCORD_SEED, PARTICIPANT_SEED, TRACK_WEEKLY, TREASURY, USDC_MINT, VERIFIER,
            WEEKLY_ENTRY_FEE, WEEKLY_LAUNCH_TS, WEEK_SECONDS,
        },
        state::{Challenge, DiscordLink, Participant},
    },
    solana_account::Account,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

pub const USDC: u64 = 1_000_000;
pub const DAY: i64 = 24 * 60 * 60;

pub struct Env {
    pub svm: LiteSVM,
    pub verifier: Keypair,
}

pub fn setup(now: i64) -> Env {
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/proof_of_grind.so"));
    svm.add_program(proof_of_grind::id(), bytes).unwrap();

    let verifier = load_keypair(concat!(env!("CARGO_MANIFEST_DIR"), "/../../server/.keys/verifier.json"));
    assert_eq!(verifier.pubkey(), VERIFIER, "server/.keys/verifier.json must match VERIFIER");

    // The oracle pays the fees for recording progress.
    svm.airdrop(&verifier.pubkey(), 10_000_000_000).unwrap();
    set_mint(&mut svm, &USDC_MINT, 6);
    set_time(&mut svm, now);
    Env { svm, verifier }
}

pub fn set_time(svm: &mut LiteSVM, now: i64) {
    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp = now;
    svm.set_sysvar(&clock);
}

pub fn load_keypair(path: &str) -> Keypair {
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

pub fn set_mint(svm: &mut LiteSVM, mint: &Pubkey, decimals: u8) {
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

pub fn set_token_account(svm: &mut LiteSVM, address: &Pubkey, mint: &Pubkey, owner: &Pubkey, amount: u64) {
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

pub fn token_amount(svm: &LiteSVM, address: &Pubkey) -> u64 {
    let acc = svm.get_account(address).unwrap();
    u64::from_le_bytes(acc.data[64..72].try_into().unwrap())
}

pub fn ata(owner: &Pubkey) -> Pubkey {
    associated_token::get_associated_token_address(owner, &USDC_MINT)
}

pub fn challenge_pda(track: u8, id: u64) -> Pubkey {
    Pubkey::find_program_address(&[CHALLENGE_SEED, &[track], &id.to_le_bytes()], &proof_of_grind::id()).0
}

pub fn participant_pda(challenge: &Pubkey, user: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[PARTICIPANT_SEED, challenge.as_ref(), user.as_ref()], &proof_of_grind::id()).0
}

pub fn discord_link_pda(challenge: &Pubkey, discord_id: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[DISCORD_SEED, challenge.as_ref(), &discord_id.to_le_bytes()],
        &proof_of_grind::id(),
    )
    .0
}

/// First signer pays fees.
pub fn send(svm: &mut LiteSVM, ix: Instruction, signers: &[&Keypair]) -> Result<(), String> {
    svm.expire_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&signers[0].pubkey()), &svm.latest_blockhash());
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?}", e.err))
}

pub struct Reg {
    pub track: u8,
    pub challenge_id: u64,
    pub discord_id: u64,
    pub multiply: u8,
}

pub fn weekly(challenge_id: u64, discord_id: u64, multiply: u8) -> Reg {
    Reg { track: TRACK_WEEKLY, challenge_id, discord_id, multiply }
}

pub fn register_ix(user: &Pubkey, verifier: &Pubkey, r: &Reg) -> Instruction {
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

pub fn new_user(svm: &mut LiteSVM, usdc: u64) -> Keypair {
    let user = Keypair::new();
    svm.airdrop(&user.pubkey(), 1_000_000_000).unwrap();
    set_token_account(svm, &ata(&user.pubkey()), &USDC_MINT, &user.pubkey(), usdc);
    user
}

pub fn register(env: &mut Env, user: &Keypair, r: &Reg) -> Result<(), String> {
    let ix = register_ix(&user.pubkey(), &env.verifier.pubkey(), r);
    let verifier = env.verifier.insecure_clone();
    send(&mut env.svm, ix, &[user, &verifier])
}

pub fn challenge_state(svm: &LiteSVM, id: u64) -> Challenge {
    let acc = svm.get_account(&challenge_pda(TRACK_WEEKLY, id)).unwrap();
    Challenge::try_deserialize(&mut acc.data.as_slice()).unwrap()
}


pub fn participant_state(svm: &LiteSVM, challenge: &Pubkey, user: &Pubkey) -> Participant {
    let acc = svm.get_account(&participant_pda(challenge, user)).unwrap();
    Participant::try_deserialize(&mut acc.data.as_slice()).unwrap()
}

pub fn load_treasury() -> Keypair {
    let kp = load_keypair(&(std::env::var("HOME").unwrap() + "/.config/solana/id.json"));
    assert_eq!(kp.pubkey(), TREASURY, "CLI wallet must match TREASURY");
    kp
}

pub fn record_progress_ix(verifier: &Pubkey, challenge: &Pubkey, user: &Pubkey, day_index: u8) -> Instruction {
    Instruction::new_with_bytes(
        proof_of_grind::id(),
        &proof_of_grind::instruction::RecordProgress { day_index }.data(),
        proof_of_grind::accounts::RecordProgress {
            oracle: *verifier,
            challenge: *challenge,
            participant: participant_pda(challenge, user),
        }
        .to_account_metas(None),
    )
}

pub fn challenge_at(svm: &LiteSVM, challenge: &Pubkey) -> Challenge {
    let acc = svm.get_account(challenge).unwrap();
    Challenge::try_deserialize(&mut acc.data.as_slice()).unwrap()
}

/// Marks every day of the challenge as passed, moving the clock into each day first.
/// Leaves the clock at the end of the challenge.
pub fn complete_all_days(env: &mut Env, challenge: &Pubkey, user: &Pubkey, track: u8) {
    let config = track_config(track).unwrap();
    let state = challenge_at(&env.svm, challenge);
    let verifier = env.verifier.insecure_clone();
    for day in 0..config.days {
        set_time(&mut env.svm, state.start_ts + i64::from(day) * config.day_seconds + 1);
        let ix = record_progress_ix(&verifier.pubkey(), challenge, user, day);
        send(&mut env.svm, ix, &[&verifier]).unwrap();
    }
    set_time(&mut env.svm, state.end_ts);
}

pub fn tally_ix(challenge: &Pubkey, user: &Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        proof_of_grind::id(),
        &proof_of_grind::instruction::Tally {}.data(),
        proof_of_grind::accounts::Tally {
            participant: participant_pda(challenge, user),
            challenge: *challenge,
        }
        .to_account_metas(None),
    )
}

pub fn claim_ix(challenge: &Pubkey, user: &Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        proof_of_grind::id(),
        &proof_of_grind::instruction::Claim {}.data(),
        proof_of_grind::accounts::Claim {
            user: *user,
            challenge: *challenge,
            participant: participant_pda(challenge, user),
            mint: USDC_MINT,
            user_token_account: ata(user),
            vault: ata(challenge),
            token_program: token::ID,
        }
        .to_account_metas(None),
    )
}

pub fn rollover_ix(from: &Pubkey, to: &Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        proof_of_grind::id(),
        &proof_of_grind::instruction::Rollover {}.data(),
        proof_of_grind::accounts::Rollover {
            from: *from,
            to: *to,
            mint: USDC_MINT,
            from_vault: ata(from),
            to_vault: ata(to),
            token_program: token::ID,
        }
        .to_account_metas(None),
    )
}

pub fn withdraw_fees_ix(treasury: &Pubkey, challenge: &Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        proof_of_grind::id(),
        &proof_of_grind::instruction::WithdrawFees {}.data(),
        proof_of_grind::accounts::WithdrawFees {
            treasury: *treasury,
            challenge: *challenge,
            mint: USDC_MINT,
            vault: ata(challenge),
            treasury_token_account: ata(treasury),
            token_program: token::ID,
        }
        .to_account_metas(None),
    )
}
