import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'

export const RPC_URL = process.env.RPC_URL ?? 'http://127.0.0.1:8899'
export const USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU')

export const connection = new Connection(RPC_URL, 'confirmed')

// Local CLI wallet = test USDC mint authority
export const admin = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(`${homedir()}/.config/solana/id.json`, 'utf8'))),
)
