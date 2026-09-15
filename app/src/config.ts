import { PublicKey } from '@solana/web3.js'

// Discord invite link — edit here
export const DISCORD_INVITE_URL = 'https://discord.gg/REPLACE_ME'

// Menu links — hrefs are placeholders until the pages exist
export const NAV_LINKS = [
  { label: 'How to start', href: '#how-to-start' },
  { label: 'Rules', href: '#rules' },
]

// Local validator (scripts/local-validator.sh). Switch to clusterApiUrl('devnet') later.
export const RPC_ENDPOINT = 'http://127.0.0.1:8899'
export const NETWORK_LABEL = 'Localnet'

export const USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU')
export const USDC_DECIMALS = 6

export const WEEKLY_CHALLENGE = {
  label: 'Weekly Challenge #0',
  track: 0,
  id: 0,
  entryFeeUsdc: 7,
}

export function explorerTxUrl(signature: string) {
  return `https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${encodeURIComponent(RPC_ENDPOINT)}`
}
