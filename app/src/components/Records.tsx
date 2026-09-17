import { useState } from 'react'
import type { PublicKey } from '@solana/web3.js'
import { MAX_WARNINGS } from '../config'
import { useClaimReward } from '../lib/claim'
import { useRecords, type ChallengeRecord } from '../lib/records'
import { formatDateTime, useTimeZoneMode } from '../lib/timeZone'

const RESULT_TEXT: Record<ChallengeRecord['result'], string> = {
  upcoming: 'starts soon',
  running: 'running',
  settling: 'settling',
  won: 'won',
  claimed: 'claimed',
  expired: 'unclaimed',
  missed: 'missed',
  out: `out · ${MAX_WARNINGS} warnings`,
}

function outcome(record: ChallengeRecord) {
  if (record.rewardUsdc !== null && record.result !== 'expired') {
    return `${RESULT_TEXT[record.result]} · +${record.rewardUsdc.toFixed(2)} USDC`
  }
  return RESULT_TEXT[record.result]
}

type ClaimState = { key: string; kind: 'sending' } | { key: string; kind: 'error'; message: string } | null

export type RecordOrder = 'latest' | 'oldest'

/** Past and current challenges this wallet joined, with Claim on rewards still waiting. Loads when opened. */
export function Records({ wallet, open, order }: { wallet: PublicKey | null; open: boolean; order: RecordOrder }) {
  const [refresh, setRefresh] = useState(0)
  const loaded = useRecords(wallet, open, refresh)
  const claimReward = useClaimReward()
  const [claim, setClaim] = useState<ClaimState>(null)
  const [zone] = useTimeZoneMode()
  // Loaded latest first.
  const records = loaded && order === 'oldest' ? [...loaded].reverse() : loaded

  if (!wallet) return <p className="card-empty card-center">Connect your wallet to see your records.</p>
  if (records === null) return <p className="card-empty card-center">Loading…</p>
  if (records.length === 0) return <p className="card-empty card-center">No challenges yet.</p>

  const sendClaim = async (record: ChallengeRecord) => {
    setClaim({ key: record.key, kind: 'sending' })
    try {
      await claimReward(record.track, record.challengeId)
      setClaim(null)
      setRefresh((n) => n + 1)
    } catch (err) {
      setClaim({ key: record.key, kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <ol className="records">
      {records.map((record) => {
        const state = claim?.key === record.key ? claim : null
        return (
          <li key={record.key} className="record" data-result={record.result}>
            <p className="record-title">
              <span>{record.label}</span>
              <span>{outcome(record)}</span>
            </p>
            <p className="record-meta">
              <span>
                {record.multiply}x · {record.paidUsdc} USDC
              </span>
              <span>
                {record.daysPassed} / {record.days} days
              </span>
            </p>
            {record.result === 'won' && (
              <div className="record-claim">
                <span>* Claim by {formatDateTime(record.claimDeadlineMs, zone)}</span>
                <button
                  type="button"
                  className="zone-toggle"
                  onClick={() => sendClaim(record)}
                  disabled={claim?.kind === 'sending'}
                >
                  {state?.kind === 'sending' ? 'claiming…' : 'claim'}
                </button>
              </div>
            )}
            {state?.kind === 'error' && <p className="pay-message pay-error">{state.message}</p>}
          </li>
        )
      })}
    </ol>
  )
}
