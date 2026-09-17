import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import anchor from '@anchor-lang/core'
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js'
import type { ProofOfGrind } from '../../app/src/idl/proof_of_grind.ts'
import { config } from './config.ts'

const require = createRequire(import.meta.url)
const idl = require('../../app/src/idl/proof_of_grind.json')

export const connection = new Connection(config.rpcUrl, 'confirmed')

function loadVerifier() {
  const raw = config.verifierSecretKey ?? readSecretFile()
  try {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)))
  } catch {
    throw new Error('VERIFIER_SECRET_KEY must be the JSON array from server/.keys/verifier.json')
  }
}

function readSecretFile() {
  try {
    return readFileSync(config.verifierKeyPath, 'utf8')
  } catch {
    throw new Error(
      'No verifier key: set VERIFIER_SECRET_KEY (the contents of server/.keys/verifier.json) or provide that file',
    )
  }
}

const verifier = loadVerifier()

// Read-only provider: the server never pays fees, it only co-signs.
const program = new anchor.Program<ProofOfGrind>(
  idl,
  new anchor.AnchorProvider(connection, new anchor.Wallet(verifier), { commitment: 'confirmed' }),
)

function idlConstant(name: string): string {
  const constant = idl.constants.find((c: { name: string }) => c.name === name)
  if (!constant) throw new Error(`IDL constant ${name} missing — copy the latest IDL into app/src/idl`)
  return String(constant.value)
}

const USDC_MINT = new PublicKey(idlConstant('USDC_MINT'))
export const MAX_MULTIPLY = Number(idlConstant('MAX_MULTIPLY'))
export const MAX_WARNINGS = Number(idlConstant('MAX_WARNINGS'))

export const TRACK_WEEKLY = Number(idlConstant('TRACK_WEEKLY'))
export const TRACK_BIWEEKLY = Number(idlConstant('TRACK_BIWEEKLY'))
export const TRACK_TEST = Number(idlConstant('TRACK_TEST'))

export type TrackConfig = { name: string; launchMs: number; durationMs: number; dayMs: number; days: number }

function trackFromIdl(name: string, prefix: string, durationConstant: string): TrackConfig {
  return {
    name,
    launchMs: Number(idlConstant(`${prefix}_LAUNCH_TS`)) * 1000,
    durationMs: Number(idlConstant(durationConstant)) * 1000,
    dayMs: Number(idlConstant(`${prefix}_DAY_SECONDS`)) * 1000,
    days: Number(idlConstant(`${prefix}_DAYS`)),
  }
}

/** Track parameters, straight from the program constants. */
export const TRACKS: Record<number, TrackConfig> = {
  [TRACK_WEEKLY]: trackFromIdl('Weekly Challenge', 'WEEKLY', 'WEEK_SECONDS'),
  [TRACK_BIWEEKLY]: trackFromIdl('Biweekly Challenge', 'BIWEEKLY', 'BIWEEKLY_DURATION'),
  [TRACK_TEST]: trackFromIdl('Test Challenge', 'TEST', 'TEST_DURATION'),
}

export function trackConfigOf(track: number) {
  const trackConfig = TRACKS[track]
  if (!trackConfig) throw new Error(`Track ${track} is not a track the program knows`)
  return trackConfig
}

/** Tracks this server runs: it co-signs registrations, tracks time and settles only these. */
export const ACTIVE_TRACKS = config.challengeTracks
for (const track of ACTIVE_TRACKS) trackConfigOf(track)

export function challengeStartMs(track: number, challengeId: number) {
  const { launchMs, durationMs } = trackConfigOf(track)
  return launchMs + challengeId * durationMs
}

export function challengeEndMs(track: number, challengeId: number) {
  return challengeStartMs(track, challengeId) + trackConfigOf(track).durationMs
}

/** Passed days can be recorded for this many days after a challenge ends; tallying waits for it. */
const RECORD_WINDOW_DAYS = Number(idlConstant('RECORD_WINDOW_DAYS'))

/** When a finished challenge can be tallied: after its record window closes. */
export function resultsOpenMs(track: number, challengeId: number) {
  return challengeEndMs(track, challengeId) + RECORD_WINDOW_DAYS * trackConfigOf(track).dayMs
}

/** Challenge taking registrations: the next one to start. */
export function openChallengeId(track: number, now = Date.now()) {
  const { launchMs, durationMs } = trackConfigOf(track)
  return now < launchMs ? 0 : Math.floor((now - launchMs) / durationMs) + 1
}

/** Challenge in progress right now, or null before the first one. */
export function runningChallengeId(track: number, now = Date.now()) {
  const { launchMs, durationMs } = trackConfigOf(track)
  return now < launchMs ? null : Math.floor((now - launchMs) / durationMs)
}

/** Which day of the challenge `now` falls in, or null if it is outside the challenge. */
export function dayIndexAt(track: number, challengeId: number, now: number) {
  const { durationMs, dayMs } = trackConfigOf(track)
  const offset = now - challengeStartMs(track, challengeId)
  if (offset < 0 || offset >= durationMs) return null
  return Math.floor(offset / dayMs)
}

export function dayEndMs(track: number, challengeId: number, dayIndex: number) {
  return challengeStartMs(track, challengeId) + (dayIndex + 1) * trackConfigOf(track).dayMs
}

function u64le(value: anchor.BN | number | string) {
  return new anchor.BN(value).toArrayLike(Buffer, 'le', 8)
}

export function challengePda(track: number, challengeId: number) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('challenge'), Buffer.from([track]), u64le(challengeId)],
    program.programId,
  )[0]
}

export function participantPda(challenge: PublicKey, user: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('participant'), challenge.toBuffer(), user.toBuffer()],
    program.programId,
  )[0]
}

export function discordLinkPda(challenge: PublicKey, discordId: string) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('discord'), challenge.toBuffer(), u64le(discordId)],
    program.programId,
  )[0]
}

export function warningPda(challenge: PublicKey, user: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('warning'), challenge.toBuffer(), user.toBuffer()],
    program.programId,
  )[0]
}

export function walletLockPda(user: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from('wallet_lock'), user.toBuffer()], program.programId)[0]
}

export function discordLockPda(discordId: string) {
  return PublicKey.findProgramAddressSync([Buffer.from('discord_lock'), u64le(discordId)], program.programId)[0]
}

export class RegistrationError extends Error {
  code: string
  status: 400 | 409
  constructor(code: string, status: 400 | 409, message: string) {
    super(message)
    this.code = code
    this.status = status
  }
}

/** True if the lock holds a challenge on another track that overlaps [startMs, endMs). */
async function lockBlocks(lock: PublicKey, track: number, startMs: number, endMs: number) {
  const held = await program.account.participationLock.fetchNullable(lock)
  if (!held || held.track === track) return false
  return startMs < held.endTs.toNumber() * 1000 && held.startTs.toNumber() * 1000 < endMs
}

/**
 * Builds the register transaction for the open challenge on a track, bound to the OAuth-verified
 * Discord id, and co-signs it with the verifier key.
 */
export async function buildRegisterTx(track: number, wallet: PublicKey, discordId: string, multiply: number) {
  if (!ACTIVE_TRACKS.includes(track)) {
    throw new RegistrationError('track-closed', 400, 'Registration for this challenge is not open yet.')
  }
  if (!Number.isInteger(multiply) || multiply < 1 || multiply > MAX_MULTIPLY) {
    throw new RegistrationError('invalid-multiply', 400, `Multiply must be between 1 and ${MAX_MULTIPLY}.`)
  }
  const challengeId = openChallengeId(track)
  const challenge = challengePda(track, challengeId)
  const [linkInfo, participantInfo] = await connection.getMultipleAccountsInfo([
    discordLinkPda(challenge, discordId),
    participantPda(challenge, wallet),
  ])
  if (participantInfo) throw new RegistrationError('wallet-registered', 409, 'This wallet is already registered.')
  if (linkInfo) throw new RegistrationError('discord-registered', 409, 'This Discord account is already registered.')

  // The program enforces this too; checking here gives a clear message instead of a failed transaction.
  const startMs = challengeStartMs(track, challengeId)
  const endMs = challengeEndMs(track, challengeId)
  const [walletBusy, discordBusy] = await Promise.all([
    lockBlocks(walletLockPda(wallet), track, startMs, endMs),
    lockBlocks(discordLockPda(discordId), track, startMs, endMs),
  ])
  if (walletBusy || discordBusy) {
    throw new RegistrationError(
      'overlapping-challenge',
      409,
      'You are already in a challenge on another track at that time.',
    )
  }

  const ix = await program.methods
    .register(track, new anchor.BN(challengeId), new anchor.BN(discordId), multiply)
    .accountsPartial({
      user: wallet,
      verifier: verifier.publicKey,
      challenge,
      participant: participantPda(challenge, wallet),
      discordLink: discordLinkPda(challenge, discordId),
      walletLock: walletLockPda(wallet),
      discordLock: discordLockPda(discordId),
      mint: USDC_MINT,
      userTokenAccount: getAssociatedTokenAddressSync(USDC_MINT, wallet, true),
      vault: getAssociatedTokenAddressSync(USDC_MINT, challenge, true),
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction()

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  const tx = new Transaction({ feePayer: wallet, blockhash, lastValidBlockHeight }).add(ix)
  tx.partialSign(verifier)

  return {
    track,
    challengeId,
    transaction: tx.serialize({ requireAllSignatures: false }).toString('base64'),
    lastValidBlockHeight,
  }
}

/** Active tracks where this Discord account joined the open challenge (just paid) or the running one. */
export async function registeredTracks(discordId: string) {
  const candidates = ACTIVE_TRACKS.flatMap((track) =>
    [openChallengeId(track), runningChallengeId(track)]
      .filter((id): id is number => id !== null)
      .map((id) => ({ track, link: discordLinkPda(challengePda(track, id), discordId) })),
  )
  const infos = await connection.getMultipleAccountsInfo(candidates.map((c) => c.link))
  return [...new Set(candidates.filter((_, i) => infos[i]).map((c) => c.track))]
}

/** Discord ids registered for a challenge (read from chain). */
export async function registeredDiscordIds(track: number, challengeId: number): Promise<string[]> {
  const links = await program.account.discordLink.all([
    { memcmp: { offset: 8, bytes: challengePda(track, challengeId).toBase58() } },
  ])
  return links.map((l) => l.account.discordId.toString())
}

/** Sends a transaction signed (and paid for) by the server's oracle key. */
async function sendAsOracle(instruction: anchor.web3.TransactionInstruction) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  const tx = new Transaction({ feePayer: verifier.publicKey, blockhash, lastValidBlockHeight }).add(instruction)
  tx.sign(verifier)
  const signature = await connection.sendRawTransaction(tx.serialize())
  const result = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
  if (result.value.err) throw new Error(JSON.stringify(result.value.err))
  return signature
}

const faucet = loadFaucet()

function loadFaucet() {
  const raw = config.faucetSecretKey ?? tryRead(config.faucetKeyPath)
  if (!raw) return null
  try {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)))
  } catch {
    console.warn('[faucet] FAUCET_SECRET_KEY is not a valid key — test SOL is disabled')
    return null
  }
}

function tryRead(path: URL) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

export const faucetConfigured = faucet !== null
export const faucetAddress = faucet?.publicKey.toBase58() ?? null

export async function faucetBalanceSol() {
  return faucet ? (await connection.getBalance(faucet.publicKey)) / LAMPORTS_PER_SOL : null
}

export async function walletBalanceSol(wallet: PublicKey) {
  return (await connection.getBalance(wallet)) / LAMPORTS_PER_SOL
}

/** Sends a little SOL so a tester can pay transaction fees. */
export async function sendTestSol(wallet: PublicKey, sol: number) {
  if (!faucet) throw new Error('No faucet key')
  const lamports = Math.round(sol * LAMPORTS_PER_SOL)
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  const tx = new Transaction({ feePayer: faucet.publicKey, blockhash, lastValidBlockHeight }).add(
    SystemProgram.transfer({ fromPubkey: faucet.publicKey, toPubkey: wallet, lamports }),
  )
  tx.sign(faucet)
  const signature = await connection.sendRawTransaction(tx.serialize())
  const result = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
  if (result.value.err) throw new Error(JSON.stringify(result.value.err))
  return { signature, lamports }
}

export async function oracleBalanceSol() {
  return (await connection.getBalance(verifier.publicKey)) / 1e9
}

export const oracleAddress = verifier.publicKey.toBase58()

/** Marks one day as passed on chain. Safe to call again for the same day. */
export async function recordProgress(track: number, challengeId: number, user: PublicKey, dayIndex: number) {
  const challenge = challengePda(track, challengeId)
  const ix = await program.methods
    .recordProgress(dayIndex)
    .accountsPartial({ oracle: verifier.publicKey, challenge, participant: participantPda(challenge, user) })
    .instruction()
  return sendAsOracle(ix)
}

export async function tally(track: number, challengeId: number, user: PublicKey) {
  const challenge = challengePda(track, challengeId)
  const ix = await program.methods
    .tally()
    .accountsPartial({ challenge, participant: participantPda(challenge, user), warning: warningPda(challenge, user) })
    .instruction()
  return sendAsOracle(ix)
}

/** Gives a participant one warning (a jury upheld a report). 3 warnings and they are out. */
export async function addWarning(track: number, challengeId: number, user: PublicKey) {
  const challenge = challengePda(track, challengeId)
  const ix = await program.methods
    .addWarning()
    .accountsPartial({
      oracle: verifier.publicKey,
      challenge,
      participant: participantPda(challenge, user),
      warning: warningPda(challenge, user),
    })
    .instruction()
  return sendAsOracle(ix)
}

/** Warnings a participant has in a challenge. */
export async function warningCount(track: number, challengeId: number, user: PublicKey) {
  const warning = await program.account.warning.fetchNullable(warningPda(challengePda(track, challengeId), user))
  return warning?.count ?? 0
}

export async function rollover(track: number, fromId: number, toId: number) {
  const from = challengePda(track, fromId)
  const to = challengePda(track, toId)
  const ix = await program.methods
    .rollover()
    .accountsPartial({
      from,
      to,
      mint: USDC_MINT,
      fromVault: getAssociatedTokenAddressSync(USDC_MINT, from, true),
      toVault: getAssociatedTokenAddressSync(USDC_MINT, to, true),
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction()
  return sendAsOracle(ix)
}

export type ParticipantRow = {
  discordId: string
  user: PublicKey
  tallied: boolean
  claimed: boolean
  daysCompleted: number
}

/** Everyone registered for a challenge, read from chain. */
export async function participantsOf(track: number, challengeId: number): Promise<ParticipantRow[]> {
  const rows = await program.account.participant.all([
    { memcmp: { offset: 8, bytes: challengePda(track, challengeId).toBase58() } },
  ])
  return rows.map((row) => ({
    discordId: row.account.discordId.toString(),
    user: row.account.user,
    tallied: row.account.tallied,
    claimed: row.account.claimed,
    daysCompleted: row.account.daysCompleted,
  }))
}

/**
 * Every challenge this Discord account joined, newest first — found by the discord id stored in
 * the participant account, so it keeps working for challenges that ended long ago.
 * Participant layout: 8 discriminator + 32 challenge + 32 user, then the discord id.
 */
const DISCORD_ID_OFFSET = 8 + 32 + 32

export async function myChallenges(discordId: string) {
  const rows = await program.account.participant.all([
    { memcmp: { offset: DISCORD_ID_OFFSET, bytes: anchor.utils.bytes.bs58.encode(u64le(discordId)) } },
  ])
  const joined = await Promise.all(
    rows.map(async (row) => {
      const challenge = await program.account.challenge.fetchNullable(row.account.challenge)
      const trackConfig = challenge && TRACKS[challenge.track]
      if (!challenge || !trackConfig) return null
      const fullMask = (1 << trackConfig.days) - 1
      return {
        track: challenge.track,
        challengeId: challenge.challengeId.toNumber(),
        startMs: challenge.startTs.toNumber() * 1000,
        endMs: challenge.endTs.toNumber() * 1000,
        registeredAt: row.account.registeredAt.toNumber(),
        claimed: row.account.claimed,
        passedEveryDay: (row.account.daysCompleted & fullMask) === fullMask,
        finalized: challenge.finalized,
      }
    }),
  )
  return joined
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => b.registeredAt - a.registeredAt)
}

export async function challengeState(track: number, challengeId: number) {
  return program.account.challenge.fetchNullable(challengePda(track, challengeId))
}
