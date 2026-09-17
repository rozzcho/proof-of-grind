import { BN } from '@anchor-lang/core'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { PublicKey } from '@solana/web3.js'
import idl from '../idl/proof_of_grind.json'
import { USDC_MINT } from '../config'

export const PROGRAM_ID = new PublicKey(idl.address)

export function challengePda(track: number, id: number) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('challenge'), Buffer.from([track]), new BN(id).toArrayLike(Buffer, 'le', 8)],
    PROGRAM_ID,
  )[0]
}

export function participantPda(challenge: PublicKey, user: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('participant'), challenge.toBuffer(), user.toBuffer()],
    PROGRAM_ID,
  )[0]
}

export function warningPda(challenge: PublicKey, user: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('warning'), challenge.toBuffer(), user.toBuffer()],
    PROGRAM_ID,
  )[0]
}

export function usdcAta(owner: PublicKey) {
  return getAssociatedTokenAddressSync(USDC_MINT, owner, true)
}
