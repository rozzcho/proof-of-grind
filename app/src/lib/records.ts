import { useEffect, useState } from 'react'
import { BorshAccountsCoder, type Idl } from '@anchor-lang/core'
import { useConnection } from '@solana/wallet-adapter-react'
import type { Connection, PublicKey } from '@solana/web3.js'
import idl from '../idl/proof_of_grind.json'
import { CLAIM_WINDOW_MS, MAX_WARNINGS, USDC_DECIMALS } from '../config'
import { PRIZE_POOL_SHARE } from './challenge'
import { PROGRAM_ID, warningPda } from './program'

const coder = new BorshAccountsCoder(idl as unknown as Idl)

// Participant account: 8 discriminator + challenge 32, then the user's key; 102 bytes in total.
const PARTICIPANT_SIZE = 102
const USER_OFFSET = 40
const PAYOUT_UNIT = 10_000 // rewards are rounded down to 0.01 USDC

const TRACK_NAMES: Record<number, string> = { 0: 'Weekly', 1: 'Biweekly', 2: 'Test' }

export type RecordResult = 'upcoming' | 'running' | 'settling' | 'won' | 'claimed' | 'expired' | 'missed' | 'out'

export type ChallengeRecord = {
  key: string
  label: string
  track: number
  challengeId: number
  /** Unix seconds. */
  startTs: number
  /** Last moment the reward can be claimed (ms). */
  claimDeadlineMs: number
  multiply: number
  paidUsdc: number
  daysPassed: number
  days: number
  result: RecordResult
  /** Reward for a winner, once settled. */
  rewardUsdc: number | null
}

type Num = { toString(): string }
const num = (value: Num | number) => Number(value.toString())

function bitCount(mask: number) {
  let count = 0
  for (let m = mask; m; m &= m - 1) count++
  return count
}

/** Every challenge this wallet joined, latest start first. */
export async function loadRecords(connection: Connection, wallet: PublicKey): Promise<ChallengeRecord[]> {
  const participants = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [{ dataSize: PARTICIPANT_SIZE }, { memcmp: { offset: USER_OFFSET, bytes: wallet.toBase58() } }],
  })
  const decoded = participants.map(({ pubkey, account }) => ({
    key: pubkey.toBase58(),
    p: coder.decode('Participant', account.data) as {
      challenge: PublicKey
      multiply: number
      amount_paid: Num
      days_completed: number
      claimed: boolean
    },
  }))
  const [challenges, warningInfos] = await Promise.all([
    connection.getMultipleAccountsInfo(decoded.map(({ p }) => p.challenge)),
    connection.getMultipleAccountsInfo(decoded.map(({ p }) => warningPda(p.challenge, wallet))),
  ])
  const now = Date.now() / 1000

  const list = decoded.flatMap(({ key, p }, i): ChallengeRecord[] => {
    const info = challenges[i]
    if (!info) return []
    const c = coder.decode('Challenge', info.data) as {
      track: number
      challenge_id: Num
      start_ts: Num
      end_ts: Num
      total_deposited: Num
      carry_over: Num
      winner_shares: Num
      finalized: boolean
    }
    const days = dayCount(c.track)
    const fullMask = (1 << days) - 1
    const warningInfo = warningInfos[i]
    const warnedOut =
      (warningInfo ? (coder.decode('Warning', warningInfo.data) as { count: number }).count : 0) >= MAX_WARNINGS
    const passedAll = (p.days_completed & fullMask) === fullMask && !warnedOut
    const winnerShares = num(c.winner_shares)
    const prizePool = num(c.total_deposited) * PRIZE_POOL_SHARE + num(c.carry_over)
    const reward =
      c.finalized && passedAll && winnerShares > 0
        ? (Math.floor((prizePool * p.multiply) / winnerShares / PAYOUT_UNIT) * PAYOUT_UNIT) / 10 ** USDC_DECIMALS
        : null
    const result: RecordResult = warnedOut
      ? 'out'
      : !c.finalized
      ? now < num(c.start_ts)
        ? 'upcoming'
        : now < num(c.end_ts)
        ? 'running'
        : 'settling'
      : !passedAll
        ? 'missed'
        : p.claimed
          ? 'claimed'
          : now * 1000 >= num(c.end_ts) * 1000 + CLAIM_WINDOW_MS
            ? 'expired'
            : 'won'
    const challengeId = num(c.challenge_id)
    return [
      {
        key,
        label: `${TRACK_NAMES[c.track] ?? 'Challenge'} #${challengeId}`,
        track: c.track,
        challengeId,
        startTs: num(c.start_ts),
        claimDeadlineMs: num(c.end_ts) * 1000 + CLAIM_WINDOW_MS,
        multiply: p.multiply,
        paidUsdc: num(p.amount_paid) / 10 ** USDC_DECIMALS,
        daysPassed: bitCount(p.days_completed & fullMask),
        days,
        result,
        rewardUsdc: reward,
      },
    ]
  })
  return list.sort((a, b) => b.startTs - a.startTs)
}

/** Loads the records when `enabled` (the Records view is open). */
export function useRecords(wallet: PublicKey | null, enabled: boolean, refresh = 0) {
  const { connection } = useConnection()
  const [records, setRecords] = useState<ChallengeRecord[] | null>(null)

  useEffect(() => {
    if (!wallet || !enabled) return
    let cancelled = false
    setRecords(null)
    loadRecords(connection, wallet)
      .catch(() => [])
      .then((list) => !cancelled && setRecords(list))
    return () => {
      cancelled = true
    }
  }, [connection, wallet, enabled, refresh])

  return records
}

/** Days per track, from the program's constants (e.g. WEEKLY_DAYS). */
function dayCount(track: number) {
  const name = `${track === 0 ? 'WEEKLY' : track === 1 ? 'BIWEEKLY' : 'TEST'}_DAYS`
  const constant = idl.constants.find((c) => c.name === name)
  return constant ? Number(constant.value) : 7
}
