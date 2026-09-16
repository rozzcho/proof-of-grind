import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import anchor from '@anchor-lang/core'
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js'
import type { ProofOfGrind } from '../../app/src/idl/proof_of_grind.ts'
import { config } from './config.ts'

const require = createRequire(import.meta.url)
const idl = require('../../app/src/idl/proof_of_grind.json')

export const connection = new Connection(config.rpcUrl, 'confirmed')

const verifier = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(config.verifierSecretKey ?? readFileSync(config.verifierKeyPath, 'utf8'))),
)

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

/** Track parameters, straight from the program constants. */
const TRACKS = {
  [Number(idlConstant('TRACK_WEEKLY'))]: {
    launchMs: Number(idlConstant('WEEKLY_LAUNCH_TS')) * 1000,
    durationMs: Number(idlConstant('WEEK_SECONDS')) * 1000,
    dayMs: Number(idlConstant('WEEKLY_DAY_SECONDS')) * 1000,
    days: Number(idlConstant('WEEKLY_DAYS')),
  },
  [Number(idlConstant('TRACK_TEST'))]: {
    launchMs: Number(idlConstant('TEST_LAUNCH_TS')) * 1000,
    durationMs: Number(idlConstant('TEST_DURATION')) * 1000,
    dayMs: Number(idlConstant('TEST_DAY_SECONDS')) * 1000,
    days: Number(idlConstant('TEST_DAYS')),
  },
} as const

export const TRACK = config.challengeTrack
export const trackConfig = TRACKS[TRACK]
if (!trackConfig) throw new Error(`CHALLENGE_TRACK ${TRACK} is not a track the program knows`)

export function challengeStartMs(challengeId: number) {
  return trackConfig.launchMs + challengeId * trackConfig.durationMs
}

export function challengeEndMs(challengeId: number) {
  return challengeStartMs(challengeId) + trackConfig.durationMs
}

/** Challenge taking registrations: the next one to start. */
export function openChallengeId(now = Date.now()) {
  return now < trackConfig.launchMs ? 0 : Math.floor((now - trackConfig.launchMs) / trackConfig.durationMs) + 1
}

/** Challenge in progress right now, or null before the first one. */
export function runningChallengeId(now = Date.now()) {
  return now < trackConfig.launchMs ? null : Math.floor((now - trackConfig.launchMs) / trackConfig.durationMs)
}

/** Which day of the challenge `now` falls in, or null if it is outside the challenge. */
export function dayIndexAt(challengeId: number, now: number) {
  const offset = now - challengeStartMs(challengeId)
  if (offset < 0 || offset >= trackConfig.durationMs) return null
  return Math.floor(offset / trackConfig.dayMs)
}

export function dayEndMs(challengeId: number, dayIndex: number) {
  return challengeStartMs(challengeId) + (dayIndex + 1) * trackConfig.dayMs
}

function u64le(value: anchor.BN | number | string) {
  return new anchor.BN(value).toArrayLike(Buffer, 'le', 8)
}

export function challengePda(challengeId: number) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('challenge'), Buffer.from([TRACK]), u64le(challengeId)],
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

export class RegistrationError extends Error {
  code: string
  status: 400 | 409
  constructor(code: string, status: 400 | 409, message: string) {
    super(message)
    this.code = code
    this.status = status
  }
}

/**
 * Builds the register transaction for the open weekly challenge, bound to the OAuth-verified
 * Discord id, and co-signs it with the verifier key.
 */
export async function buildRegisterTx(wallet: PublicKey, discordId: string, multiply: number) {
  if (!Number.isInteger(multiply) || multiply < 1 || multiply > MAX_MULTIPLY) {
    throw new RegistrationError('invalid-multiply', 400, `Multiply must be between 1 and ${MAX_MULTIPLY}.`)
  }
  const challengeId = openChallengeId()
  const challenge = challengePda(challengeId)
  const [linkInfo, participantInfo] = await connection.getMultipleAccountsInfo([
    discordLinkPda(challenge, discordId),
    participantPda(challenge, wallet),
  ])
  if (participantInfo) throw new RegistrationError('wallet-registered', 409, 'This wallet is already registered.')
  if (linkInfo) throw new RegistrationError('discord-registered', 409, 'This Discord account is already registered.')

  const ix = await program.methods
    .register(TRACK, new anchor.BN(challengeId), new anchor.BN(discordId), multiply)
    .accountsPartial({
      user: wallet,
      verifier: verifier.publicKey,
      challenge,
      participant: participantPda(challenge, wallet),
      discordLink: discordLinkPda(challenge, discordId),
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
    challengeId,
    transaction: tx.serialize({ requireAllSignatures: false }).toString('base64'),
    lastValidBlockHeight,
  }
}

/** Registered for the open challenge (just paid) or the running one. */
export async function isDiscordRegistered(discordId: string) {
  const ids = [openChallengeId(), runningChallengeId()].filter((id) => id !== null)
  const infos = await connection.getMultipleAccountsInfo(ids.map((id) => discordLinkPda(challengePda(id), discordId)))
  return infos.some(Boolean)
}

/** Discord ids registered for a challenge (read from chain). */
export async function registeredDiscordIds(challengeId: number): Promise<string[]> {
  const links = await program.account.discordLink.all([
    { memcmp: { offset: 8, bytes: challengePda(challengeId).toBase58() } },
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

export async function oracleBalanceSol() {
  return (await connection.getBalance(verifier.publicKey)) / 1e9
}

export const oracleAddress = verifier.publicKey.toBase58()

/** Marks one day as passed on chain. Safe to call again for the same day. */
export async function recordProgress(challengeId: number, user: PublicKey, dayIndex: number) {
  const challenge = challengePda(challengeId)
  const ix = await program.methods
    .recordProgress(dayIndex)
    .accountsPartial({ oracle: verifier.publicKey, challenge, participant: participantPda(challenge, user) })
    .instruction()
  return sendAsOracle(ix)
}

export async function tally(challengeId: number, user: PublicKey) {
  const challenge = challengePda(challengeId)
  const ix = await program.methods
    .tally()
    .accountsPartial({ challenge, participant: participantPda(challenge, user) })
    .instruction()
  return sendAsOracle(ix)
}

export async function rollover(fromId: number, toId: number) {
  const from = challengePda(fromId)
  const to = challengePda(toId)
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

export type ParticipantRow = { discordId: string; user: PublicKey; tallied: boolean }

/** Everyone registered for a challenge, read from chain. */
export async function participantsOf(challengeId: number): Promise<ParticipantRow[]> {
  const rows = await program.account.participant.all([
    { memcmp: { offset: 8, bytes: challengePda(challengeId).toBase58() } },
  ])
  return rows.map((row) => ({
    discordId: row.account.discordId.toString(),
    user: row.account.user,
    tallied: row.account.tallied,
  }))
}

export async function challengeState(challengeId: number) {
  return program.account.challenge.fetchNullable(challengePda(challengeId))
}
