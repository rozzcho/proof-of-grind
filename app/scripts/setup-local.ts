// Creates Weekly Challenge #0 (7 USDC) on the local validator.
import { PublicKey } from '@solana/web3.js'
import anchor from '@anchor-lang/core'
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { USDC_MINT, admin, connection, getProgram } from './common.ts'

const TRACK = 0
const CHALLENGE_ID = 0
const ENTRY_FEE = 7_000_000 // 7 USDC

const program = getProgram()
const [challenge] = PublicKey.findProgramAddressSync(
  [Buffer.from('challenge'), Buffer.from([TRACK]), new anchor.BN(CHALLENGE_ID).toArrayLike(Buffer, 'le', 8)],
  program.programId,
)

if (await connection.getAccountInfo(challenge)) {
  console.log(`Weekly #${CHALLENGE_ID} already exists: ${challenge.toBase58()}`)
} else {
  const sig = await program.methods
    .createChallenge(TRACK, new anchor.BN(CHALLENGE_ID), new anchor.BN(ENTRY_FEE))
    .accountsPartial({
      authority: admin.publicKey,
      challenge,
      mint: USDC_MINT,
      vault: getAssociatedTokenAddressSync(USDC_MINT, challenge, true),
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc()
  console.log(`Created Weekly #${CHALLENGE_ID}: ${challenge.toBase58()} (tx ${sig})`)
}
console.log('mint:', USDC_MINT.toBase58())
