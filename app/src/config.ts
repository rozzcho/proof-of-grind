import { PublicKey } from '@solana/web3.js'
import idl from './idl/proof_of_grind.json'

// Discord invite link — edit here
export const DISCORD_INVITE_URL = 'https://discord.gg/QAJcGjP3Sh'

// Defaults target the local validator (scripts/local-validator.sh); deployments set VITE_*.
export const RPC_ENDPOINT = import.meta.env.VITE_RPC_URL ?? 'http://127.0.0.1:8899'
export const NETWORK = import.meta.env.VITE_SOLANA_NETWORK ?? 'localnet'
export const NETWORK_LABEL = NETWORK === 'devnet' ? 'Devnet' : NETWORK === 'mainnet' ? 'Mainnet' : 'Localnet'

function idlConstant(name: string): string {
  const constant = idl.constants.find((c) => c.name === name)
  if (!constant) throw new Error(`IDL constant ${name} missing`)
  return String(constant.value)
}

export const USDC_MINT = new PublicKey(idlConstant('USDC_MINT'))
export const USDC_DECIMALS = 6

// Challenge terms come from the program so the UI always matches what gets charged.
const TRACKS = {
  [Number(idlConstant('TRACK_WEEKLY'))]: {
    name: 'Weekly Challenge',
    track: Number(idlConstant('TRACK_WEEKLY')),
    launchMs: Number(idlConstant('WEEKLY_LAUNCH_TS')) * 1000,
    durationMs: Number(idlConstant('WEEK_SECONDS')) * 1000,
    dayMs: Number(idlConstant('WEEKLY_DAY_SECONDS')) * 1000,
    days: Number(idlConstant('WEEKLY_DAYS')),
    entryFeeUsdc: Number(idlConstant('WEEKLY_ENTRY_FEE')) / 10 ** USDC_DECIMALS,
  },
  [Number(idlConstant('TRACK_TEST'))]: {
    name: 'Test Challenge',
    track: Number(idlConstant('TRACK_TEST')),
    launchMs: Number(idlConstant('TEST_LAUNCH_TS')) * 1000,
    durationMs: Number(idlConstant('TEST_DURATION')) * 1000,
    dayMs: Number(idlConstant('TEST_DAY_SECONDS')) * 1000,
    days: Number(idlConstant('TEST_DAYS')),
    entryFeeUsdc: Number(idlConstant('TEST_ENTRY_FEE')) / 10 ** USDC_DECIMALS,
  },
} as const

/** Which track this site runs; VITE_CHALLENGE_TRACK=2 switches to the short test track. */
const track = Number(import.meta.env.VITE_CHALLENGE_TRACK ?? idlConstant('TRACK_WEEKLY'))
const selected = TRACKS[track as keyof typeof TRACKS]
if (!selected) throw new Error(`VITE_CHALLENGE_TRACK ${track} is not a track the program knows`)

export const CHALLENGE = { ...selected, maxMultiply: Number(idlConstant('MAX_MULTIPLY')) }

export function explorerTxUrl(signature: string) {
  const cluster =
    NETWORK === 'mainnet'
      ? ''
      : NETWORK === 'devnet'
        ? '?cluster=devnet'
        : `?cluster=custom&customUrl=${encodeURIComponent(RPC_ENDPOINT)}`
  return `https://explorer.solana.com/tx/${signature}${cluster}`
}
