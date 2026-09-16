import type { ToggleItem } from './components/NavToggle'
import { WEEKLY } from './config'

export const HOW_TO_START: ToggleItem[] = [
  {
    title: 'Connect your wallet',
    body: 'Click "Select Wallet" and connect a Solana wallet.',
  },
  {
    title: 'Register for the challenge',
    body: `Click "Register Weekly Challenge", link your Discord account, choose your multiply, and pay ${WEEKLY.entryFeeUsdc} USDC × multiply.`,
  },
  {
    title: 'Join Discord',
    body: "You're added to the server and the private challenge room unlocks automatically.",
  },
  {
    title: 'Grind',
    body: 'Stay in the challenge voice channel for at least 3 hours, every day of the challenge. Miss a day and you are out.',
  },
  {
    title: 'Claim your reward',
    body: 'Made it through every day? Claim your share of the prize pool when the challenge ends.',
  },
]

export const RULES: ToggleItem[] = [
  {
    title: 'Pass or fail',
    body: 'Winners are decided only by time spent in the challenge voice channel on Discord. Hit the daily goal every day and you win. Miss it once and you do not. No exceptions.',
  },
  {
    title: '5% fee',
    body: 'The entry pool is everything paid in. 5% of it covers exchange fees first; whatever is left of that 5% is the platform fee. The other 95% is the prize pool.',
  },
  {
    title: 'Multiply',
    body: 'Winners split the prize pool in proportion to their multiply. Example: winners at 1x, 5x and 10x split it into 16 shares and take 1, 5 and 10 shares.',
  },
  {
    title: 'Rounding',
    body: 'Rewards are rounded down to 2 decimal places.',
  },
  {
    title: 'Schedule',
    body: 'Each weekly challenge runs Monday to Sunday. All days and times are in UTC.',
  },
  {
    title: 'Nobody wins',
    body: 'If no one passes every day, the prize pool rolls over to the next challenge.',
  },
]
