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
  Uint8Array.from(JSON.parse(readFileSync(config.verifierKeyPath, 'utf8'))),
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
const TRACK_WEEKLY = Number(idlConstant('TRACK_WEEKLY'))
const WEEKLY_LAUNCH_MS = Number(idlConstant('WEEKLY_LAUNCH_TS')) * 1000
const WEEK_MS = Number(idlConstant('WEEK_SECONDS')) * 1000
export const MAX_MULTIPLY = Number(idlConstant('MAX_MULTIPLY'))

/** Challenge taking registrations: the one starting next Monday 00:00 UTC. */
export function openChallengeId(now = Date.now()) {
  return now < WEEKLY_LAUNCH_MS ? 0 : Math.floor((now - WEEKLY_LAUNCH_MS) / WEEK_MS) + 1
}

/** Challenge in progress this week, or null before launch. */
export function runningChallengeId(now = Date.now()) {
  return now < WEEKLY_LAUNCH_MS ? null : Math.floor((now - WEEKLY_LAUNCH_MS) / WEEK_MS)
}

function u64le(value: anchor.BN | number | string) {
  return new anchor.BN(value).toArrayLike(Buffer, 'le', 8)
}

export function challengePda(challengeId: number) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('challenge'), Buffer.from([TRACK_WEEKLY]), u64le(challengeId)],
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
    .register(TRACK_WEEKLY, new anchor.BN(challengeId), new anchor.BN(discordId), multiply)
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
