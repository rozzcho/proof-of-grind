import type { PublicKey } from '@solana/web3.js'
import { useRecords, type ChallengeRecord } from '../lib/records'

const RESULT_TEXT: Record<ChallengeRecord['result'], string> = {
  upcoming: 'starts soon',
  running: 'running',
  settling: 'settling',
  won: 'won · claim it',
  claimed: 'claimed',
  missed: 'missed',
}

function outcome(record: ChallengeRecord) {
  if ((record.result === 'won' || record.result === 'claimed') && record.rewardUsdc !== null) {
    return `${RESULT_TEXT[record.result]} · +${record.rewardUsdc.toFixed(2)} USDC`
  }
  return RESULT_TEXT[record.result]
}

/** Past and current challenges this wallet joined. Loads when opened. */
export type RecordOrder = 'latest' | 'oldest'

export function Records({ wallet, open, order }: { wallet: PublicKey | null; open: boolean; order: RecordOrder }) {
  const loaded = useRecords(wallet, open)
  // Loaded latest first.
  const records = loaded && order === 'oldest' ? [...loaded].reverse() : loaded

  if (!wallet) return <p className="card-empty card-center">Connect your wallet to see your records.</p>
  if (records === null) return <p className="card-empty card-center">Loading…</p>
  if (records.length === 0) return <p className="card-empty card-center">No challenges yet.</p>

  return (
    <ol className="records">
      {records.map((record) => (
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
        </li>
      ))}
    </ol>
  )
}
