import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import anchor from '@anchor-lang/core'

const require = createRequire(import.meta.url)
export const idl = require('../src/idl/proof_of_grind.json')

export const RPC_URL = process.env.RPC_URL ?? 'http://127.0.0.1:8899'
export const USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU')

export const connection = new Connection(RPC_URL, 'confirmed')

// Local CLI wallet = program ADMIN = test USDC mint authority
export const admin = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`, 'utf8'))),
)

export function getProgram() {
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(admin), {
    commitment: 'confirmed',
  })
  return new anchor.Program(idl, provider)
}
