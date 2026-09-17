import { useEffect, useState } from 'react'
import { BorshAccountsCoder, type Idl } from '@anchor-lang/core'
import { useConnection } from '@solana/wallet-adapter-react'
import idl from '../idl/proof_of_grind.json'
import { CHALLENGE, USDC_DECIMALS, trackConfig } from '../config'
import { PROGRAM_ID, challengePda } from './program'

const coder = new BorshAccountsCoder(idl as unknown as Idl)

export type ChallengeState = {
  participants: number
  /** Everything paid in, in USDC. */
  entryPool: number
  /** What winners share: 95% of the entry pool, plus anything rolled over from an earlier challenge. */
  prizePool: number
  /**
   * Participants who have not missed a day yet (every finished day recorded). Once the challenge
   * is settled, the final winner count. Only loaded when asked for.
   */
  winners: number | null
}

export const PRIZE_POOL_SHARE = 0.95

const EMPTY: ChallengeState = { participants: 0, entryPool: 0, prizePool: 0, winners: 0 }

// Participant account: 8 discriminator + challenge 32 + user 32 + discord_id 8 + multiply 1
// + amount_paid 8 + registered_at 8 = days_completed at 97; the whole account is 102 bytes.
const PARTICIPANT_SIZE = 102
const DAYS_COMPLETED_OFFSET = 97

/** Days of this challenge that are already over, as a bitmask. */
function finishedDaysMask(track: number, startMs: number, now: number) {
  const { days, dayMs } = trackConfig(track)
  const finished = Math.max(0, Math.min(days, Math.floor((now - startMs) / dayMs)))
  return (1 << finished) - 1
}

/** Reads a challenge account; a challenge nobody registered for yet does not exist on chain. */
export function useChallengeState(
  challengeId: number,
  { track = CHALLENGE.track, withWinners = false, refreshMs = 30_000 } = {},
) {
  const { connection } = useConnection()
  const [state, setState] = useState<ChallengeState | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const challenge = challengePda(track, challengeId)
        const info = await connection.getAccountInfo(challenge)
        if (cancelled) return
        if (!info) {
          setState(EMPTY)
          return
        }
        // Fields keep the program's snake_case names.
        const account = coder.decode('Challenge', info.data) as {
          participant_count: number
          total_deposited: { toString(): string }
          carry_over: { toString(): string }
          start_ts: { toString(): string }
          finalized: boolean
          winner_count: number
        }
        const entryPool = Number(account.total_deposited.toString()) / 10 ** USDC_DECIMALS
        const carryOver = Number(account.carry_over.toString()) / 10 ** USDC_DECIMALS

        let winners: number | null = null
        if (withWinners) {
          if (account.finalized) {
            winners = Number(account.winner_count)
          } else {
            const mask = finishedDaysMask(track, Number(account.start_ts.toString()) * 1000, Date.now())
            const participants = await connection.getProgramAccounts(PROGRAM_ID, {
              dataSlice: { offset: DAYS_COMPLETED_OFFSET, length: 2 },
              filters: [{ dataSize: PARTICIPANT_SIZE }, { memcmp: { offset: 8, bytes: challenge.toBase58() } }],
            })
            winners = participants.filter(({ account: p }) => (p.data.readUInt16LE(0) & mask) === mask).length
          }
          if (cancelled) return
        }

        setState({
          participants: Number(account.participant_count),
          entryPool,
          prizePool: entryPool * PRIZE_POOL_SHARE + carryOver,
          winners,
        })
      } catch {
        if (!cancelled) setState(null)
      }
    }
    load()
    const timer = setInterval(load, refreshMs)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [connection, track, challengeId, withWinners, refreshMs])

  return state
}
