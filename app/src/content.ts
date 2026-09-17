import type { ToggleItem } from './components/NavToggle'
import { BIWEEKLY, CHALLENGE, trackConfig } from './config'

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

const WEEKLY_FEE = trackConfig(0).entryFeeUsdc

export type Rule = { topic: string; text: string }

/** One line each, in the order people meet them: joining, passing, warnings, prizes, edge cases. */
export const RULES: Rule[] = [
  { topic: 'Schedule', text: 'Weekly runs Monday to Sunday, Biweekly runs 14 days, all in UTC. Registration closes when a challenge starts.' },
  { topic: 'Entry', text: `The fee × your multiply (1x to ${CHALLENGE.maxMultiply}x): ${WEEKLY_FEE} USDC for Weekly, ${BIWEEKLY.entryFeeUsdc} USDC for Biweekly.` },
  { topic: 'One track', text: "You can only be in one track at a time. Weekly and Biweekly challenges that overlap can't be combined." },
  { topic: 'What counts', text: "Only camera-on time in your track's voice channel counts. Screen sharing doesn't." },
  { topic: 'Passing', text: "Hit 3 hours on camera every day to win. Miss a single day and you're out." },
  { topic: 'Reports', text: 'Not studying on camera or disrespecting others can get you reported. If 2 of 3 random participants in the room agree, you get a warning.' },
  { topic: 'Warnings', text: "3 warnings in one challenge and you're out." },
  { topic: 'Fees', text: '5% of the entry pool covers fees. The other 95% is the prize pool.' },
  { topic: 'Prize', text: 'Winners split the prize pool by multiply, rounded down to 0.01 USDC. If nobody wins, it rolls over to the next challenge.' },
  { topic: 'Outages', text: 'If our server goes down, the lost time comes off that day’s goal. Passed days can be recorded until 2 days after the end.' },
  { topic: 'Claiming', text: 'Claim within 4 weeks after the challenge ends. Unclaimed rewards go to the platform.' },
]
