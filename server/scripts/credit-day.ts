/**
 * Marks a challenge day as passed for one participant, for cases the automatic outage handling
 * cannot cover (e.g. the server was down all day, so the participant has no time on record).
 * Only works inside the record window (until 2 days after the challenge ends).
 *
 *   npm run credit-day -- --track 0 --challenge 0 --discord 123456789012345678 --day 2
 */
import { parseArgs } from 'node:util'
import { dayIndexAt, participantsOf, recordProgress, trackConfigOf } from '../src/solana.ts'

const { values } = parseArgs({
  options: {
    track: { type: 'string' },
    challenge: { type: 'string' },
    discord: { type: 'string' },
    day: { type: 'string' },
  },
})

const track = Number(values.track)
const challengeId = Number(values.challenge)
const dayIndex = Number(values.day)
const discordId = values.discord

if (!discordId || [track, challengeId, dayIndex].some((n) => !Number.isInteger(n) || n < 0)) {
  console.error('Usage: npm run credit-day -- --track <n> --challenge <id> --discord <discord id> --day <index>')
  process.exit(1)
}
const { name, days } = trackConfigOf(track)
if (dayIndex >= days) {
  console.error(`${name} has days 0 to ${days - 1}`)
  process.exit(1)
}

const participant = (await participantsOf(track, challengeId)).find((p) => p.discordId === discordId)
if (!participant) {
  console.error(`That Discord account is not registered for ${name} #${challengeId}`)
  process.exit(1)
}

const signature = await recordProgress(track, challengeId, participant.user, dayIndex)
const today = dayIndexAt(track, challengeId, Date.now())
console.log(`Day ${dayIndex} of ${name} #${challengeId} marked as passed (today is day ${today ?? '–'}).`)
console.log(`Transaction: ${signature}`)
process.exit(0)
