import { useEffect, useState } from 'react'
import { BorshAccountsCoder, type Idl } from '@anchor-lang/core'
import { useConnection } from '@solana/wallet-adapter-react'
import idl from '../idl/proof_of_grind.json'
import { USDC_DECIMALS, WEEKLY } from '../config'
import { challengePda } from './program'

const coder = new BorshAccountsCoder(idl as unknown as Idl)

export type ChallengeState = {
  participants: number
  /** Everything paid in, in USDC. */
  entryPool: number
  /** What winners share: 95% of the entry pool. */
  prizePool: number
}

export const PRIZE_POOL_SHARE = 0.95

const EMPTY: ChallengeState = { participants: 0, entryPool: 0, prizePool: 0 }

/** Reads a challenge account; a challenge nobody registered for yet does not exist on chain. */
export function useChallengeState(challengeId: number, refreshMs = 30_000) {
  const { connection } = useConnection()
  const [state, setState] = useState<ChallengeState | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const info = await connection.getAccountInfo(challengePda(WEEKLY.track, challengeId))
        if (cancelled) return
        if (!info) {
          setState(EMPTY)
          return
        }
        // Fields keep the program's snake_case names.
        const account = coder.decode('Challenge', info.data) as {
          participant_count: number
          total_deposited: { toString(): string }
        }
        const entryPool = Number(account.total_deposited.toString()) / 10 ** USDC_DECIMALS
        setState({
          participants: Number(account.participant_count),
          entryPool,
          prizePool: entryPool * PRIZE_POOL_SHARE,
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
  }, [connection, challengeId, refreshMs])

  return state
}
