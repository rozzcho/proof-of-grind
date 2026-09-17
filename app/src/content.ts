import type { ToggleItem } from './components/NavToggle'
import { CHALLENGE } from './config'

const isWeekly = CHALLENGE.dayMs === 24 * 60 * 60 * 1000

export const SUMMARY: ToggleItem[] = [
  {
    title: 'Entry',
    body: `${CHALLENGE.entryFeeUsdc} USDC × your multiply (1x to ${CHALLENGE.maxMultiply}x). Registration closes when the challenge starts.`,
  },
  {
    title: 'When',
    body: isWeekly
      ? 'Monday 00:00 to Sunday 23:59 UTC, seven days.'
      : `${CHALLENGE.days} days of ${CHALLENGE.dayMs / 60_000} minutes each (test track).`,
  },
  {
    title: 'To pass',
    body: isWeekly
      ? 'Camera on in the challenge voice channel for 3 hours a day, every day. Time adds up within the day; screen sharing does not count.'
      : 'Camera on in the challenge voice channel for the daily goal, every day. Screen sharing does not count.',
  },
  {
    title: 'Prize',
    body: 'Winners split the prize pool (95% of entries, plus any rollover) by multiply. If nobody passes, it rolls over to the next challenge.',
  },
]

export const HOW_TO_START: ToggleItem[] = [
  {
    title: 'Connect your wallet',
    body: 'Click "Select Wallet" and connect a Solana wallet.',
  },
  {
    title: 'Register for the challenge',
    body: `Click "Register ${CHALLENGE.name}", link your Discord account, choose your multiply, and pay ${CHALLENGE.entryFeeUsdc} USDC × multiply.`,
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
    title: 'If nobody wins',
    body: 'If no one passes every day, the prize pool rolls over to the next challenge.',
  },
  {
    title: 'Server outages',
    body: 'If our server goes down and camera time cannot be counted, that time is taken off the daily goal for that day.',
  },
  {
    title: 'Warnings',
    body: 'Anyone in the voice channel can report a participant. The bot asks 3 random participants in the same room to check, and if at least 2 agree, the reported person gets a warning. Warnings are given for not actually studying on camera (an empty desk, a looped video) or for not treating others with respect. 3 warnings in one challenge and you are out.',
  },
  {
    title: 'Claim deadline',
    body: 'Claim your reward within 4 weeks after the challenge ends. Rewards left unclaimed after that go to the platform.',
  },
  {
    title: 'Recording window',
    body: 'Passed days can still be recorded for 2 days after a challenge ends, so a short server outage does not cost anyone a day. Results are tallied and rewards open after that.',
  },
]
