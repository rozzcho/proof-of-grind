import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import anchor from '@anchor-lang/core'
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js'
import type { ProofOfGrind } from '../../app/src/idl/proof_of_grind.ts'
import { CHALLENGE, config } from './config.ts'

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

const USDC_MINT = new PublicKey(
  idl.constants.find((c: { name: string }) => c.name === 'USDC_MINT').value,
)

function u64le(value: anchor.BN | number) {
  return new anchor.BN(value).toArrayLike(Buffer, 'le', 8)
}

export const challengePda = PublicKey.findProgramAddressSync(
  [Buffer.from('challenge'), Buffer.from([CHALLENGE.track]), u64le(CHALLENGE.id)],
  program.programId,
)[0]

export function participantPda(user: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('participant'), challengePda.toBuffer(), user.toBuffer()],
    program.programId,
  )[0]
}

export function discordLinkPda(discordId: string) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('discord'), challengePda.toBuffer(), u64le(new anchor.BN(discordId))],
    program.programId,
  )[0]
}

export class RegistrationError extends Error {
  code: string
  status: 404 | 409
  constructor(code: string, status: 404 | 409, message: string) {
    super(message)
    this.code = code
    this.status = status
  }
}

/** Builds the register transaction for `wallet`, bound to the OAuth-verified Discord id, and co-signs it. */
export async function buildRegisterTx(wallet: PublicKey, discordId: string) {
  const [challengeInfo, linkInfo, participantInfo] = await connection.getMultipleAccountsInfo([
    challengePda,
    discordLinkPda(discordId),
    participantPda(wallet),
  ])
  if (!challengeInfo) throw new RegistrationError('challenge-not-found', 404, 'This challenge is not open yet.')
  if (participantInfo) throw new RegistrationError('wallet-registered', 409, 'This wallet is already registered.')
  if (linkInfo) {
    throw new RegistrationError('discord-registered', 409, 'This Discord account is already registered.')
  }

  const ix = await program.methods
    .register(new anchor.BN(discordId))
    .accountsPartial({
      user: wallet,
      verifier: verifier.publicKey,
      challenge: challengePda,
      participant: participantPda(wallet),
      discordLink: discordLinkPda(discordId),
      mint: USDC_MINT,
      userTokenAccount: getAssociatedTokenAddressSync(USDC_MINT, wallet, true),
      vault: getAssociatedTokenAddressSync(USDC_MINT, challengePda, true),
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction()

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  const tx = new Transaction({ feePayer: wallet, blockhash, lastValidBlockHeight }).add(ix)
  tx.partialSign(verifier)

  return {
    transaction: tx.serialize({ requireAllSignatures: false }).toString('base64'),
    lastValidBlockHeight,
  }
}

export async function isDiscordRegistered(discordId: string) {
  return Boolean(await connection.getAccountInfo(discordLinkPda(discordId)))
}

/** Discord ids of everyone registered for the challenge (read from chain). */
export async function registeredDiscordIds(): Promise<string[]> {
  const links = await program.account.discordLink.all([
    { memcmp: { offset: 8, bytes: challengePda.toBase58() } },
  ])
  return links.map((l) => l.account.discordId.toString())
}
