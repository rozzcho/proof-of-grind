import { PublicKey } from '@solana/web3.js'
import idl from './idl/proof_of_grind.json'

// Discord invite link — edit here
export const DISCORD_INVITE_URL = 'https://discord.gg/REPLACE_ME'

// Local validator (scripts/local-validator.sh). Switch to clusterApiUrl('devnet') later.
export const RPC_ENDPOINT = 'http://127.0.0.1:8899'
export const NETWORK_LABEL = 'Localnet'

function idlConstant(name: string): string {
  const constant = idl.constants.find((c) => c.name === name)
  if (!constant) throw new Error(`IDL constant ${name} missing`)
  return String(constant.value)
}

export const USDC_MINT = new PublicKey(idlConstant('USDC_MINT'))
export const USDC_DECIMALS = 6

// Challenge terms come from the program so the UI always matches what gets charged.
export const WEEKLY = {
  track: Number(idlConstant('TRACK_WEEKLY')),
  launchMs: Number(idlConstant('WEEKLY_LAUNCH_TS')) * 1000,
  weekMs: Number(idlConstant('WEEK_SECONDS')) * 1000,
  entryFeeUsdc: Number(idlConstant('WEEKLY_ENTRY_FEE')) / 10 ** USDC_DECIMALS,
  maxMultiply: Number(idlConstant('MAX_MULTIPLY')),
}

export function explorerTxUrl(signature: string) {
  return `https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${encodeURIComponent(RPC_ENDPOINT)}`
}
