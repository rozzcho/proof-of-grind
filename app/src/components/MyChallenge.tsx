import { useCallback, useEffect, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { BorshAccountsCoder, type Idl } from '@anchor-lang/core'
import idl from '../idl/proof_of_grind.json'
import { CHALLENGE, CLAIM_WINDOW_MS, MAX_WARNINGS, USDC_DECIMALS, trackConfig, type TrackConfig } from '../config'
import { getProgress, type Progress } from '../lib/api'
import { PRIZE_POOL_SHARE, useChallengeState } from '../lib/challenge'
import { challengePda, participantPda, warningPda } from '../lib/program'
import type { Challenge } from '../lib/schedule'
import { formatDateTime, useTimeZoneMode } from '../lib/timeZone'
import { ChallengeDates } from './ChallengeCard'
import { Records, type RecordOrder } from './Records'
import { useClaimReward } from '../lib/claim'

type Claim = { kind: 'idle' } | { kind: 'sending' } | { kind: 'done' } | { kind: 'error'; message: string }

// Account fields keep the program's snake_case names.
const coder = new BorshAccountsCoder(idl as unknown as Idl)
const PAYOUT_UNIT = 10_000 // rewards are rounded down to 0.01 USDC

type Stake = {
  multiply: number
  paidUsdc: number
  passedEveryDay: boolean
  warnings: number
  /** Passed every day but got too many warnings. */
  warnedOut: boolean
  claimed: boolean
  finalized: boolean
  /** What this participant gets if they won; null until the challenge is settled. */
  payoutUsdc: number | null
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const hours = (seconds: number) => `${(seconds / 3600).toFixed(1)}h`

function dayLabel(index: number, challengeStartMs: number, dayMs: number) {
  if (dayMs !== 24 * 60 * 60 * 1000) return String(index + 1)
  const day = new Date(challengeStartMs + index * dayMs).getUTCDay()
  return WEEKDAYS[(day + 6) % 7]
}

type Day = { dayIndex: number; seconds: number; goalSeconds?: number; goalMet: boolean }

/** One square per challenge day; filled as camera time adds up. Empty squares before joining. */
function DayGrid({
  track,
  startMs,
  days,
  goalSeconds,
  today,
}: {
  track: TrackConfig
  startMs: number
  days: Day[]
  goalSeconds: number
  today: number | null
}) {
  return (
    <ol className="day-grid">
      {days.map((day) => {
        const goal = day.goalSeconds ?? goalSeconds
        const fill = day.goalMet ? 1 : goal > 0 ? Math.min(1, day.seconds / goal) : 0
        const label = dayLabel(day.dayIndex, startMs, track.dayMs)
        return (
          <li
            key={day.dayIndex}
            className="day"
            data-state={day.goalMet ? 'passed' : fill > 0 ? 'partial' : 'open'}
            data-today={day.dayIndex === today || undefined}
            style={{ '--fill': `${fill * 100}%` } as React.CSSProperties}
            title={goal > 0 ? `${label} · ${hours(day.seconds)} of ${hours(goal)}` : label}
          >
            {label}
          </li>
        )
      })}
    </ol>
  )
}

const emptyDays: Day[] = Array.from({ length: CHALLENGE.days }, (_, dayIndex) => ({ dayIndex, seconds: 0, goalMet: false }))

/**
 * Always shown. Before joining it shows the running challenge with empty day squares; after joining,
 * your progress, what you staked, and the Claim button once it is settled.
 */
type Props = { running: Challenge | null; upcoming: Challenge }

/**
 * My Challenge, with Records one click away. Both views share one grid cell, so the card keeps
 * its size when switching between them.
 */
export function MyChallenge(props: Props) {
  const { publicKey } = useWallet()
  const [showRecords, setShowRecords] = useState(false)
  const [order, setOrder] = useState<RecordOrder>('latest')

  useEffect(() => {
    if (!showRecords) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setShowRecords(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showRecords])

  return (
    <section className="card card-stack">
      <div className="card-pane" aria-hidden={showRecords} inert={showRecords} data-active={!showRecords}>
        <div className="card-head">
          <button type="button" className="card-back" onClick={() => setShowRecords(true)}>
            Records
          </button>
          <h2 className="card-title">My Challenge</h2>
        </div>
        <MyChallengeBody {...props} />
      </div>
      <div
        className="card-pane card-pane-fill"
        aria-hidden={!showRecords}
        inert={!showRecords}
        data-active={showRecords}
      >
        <div className="card-head">
          <button type="button" className="card-back" onClick={() => setShowRecords(false)}>
            ← Back
          </button>
          <h2 className="card-title">Records</h2>
          <button
            type="button"
            className="zone-toggle card-head-end"
            onClick={() => setOrder((o) => (o === 'latest' ? 'oldest' : 'latest'))}
            aria-label={`Showing ${order} first. Switch.`}
          >
            {order}
          </button>
        </div>
        <Records wallet={publicKey} open={showRecords} order={order} />
      </div>
    </section>
  )
}

function MyChallengeBody({ running, upcoming }: Props) {
  const [zone] = useTimeZoneMode()
  const claimReward = useClaimReward()
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  const [progress, setProgress] = useState<Progress | null>(null)
  const [stake, setStake] = useState<Stake | null>(null)
  const [claim, setClaim] = useState<Claim>({ kind: 'idle' })
  const [now, setNow] = useState(() => Date.now())
  const runningState = useChallengeState(running?.id ?? -1, { withWinners: true })
  // The challenge you joined can differ from the running one (e.g. last week's, still to claim).
  const joinedState = useChallengeState(progress?.registered ? progress.challengeId : -1, {
    track: progress?.track,
    withWinners: true,
  })

  const load = useCallback(async () => {
    const data = await getProgress().catch(() => null)
    setProgress(data)
    if (!data || !publicKey) return

    const challenge = challengePda(data.track, data.challengeId)
    const [challengeInfo, participantInfo, warningInfo] = await connection.getMultipleAccountsInfo([
      challenge,
      participantPda(challenge, publicKey),
      warningPda(challenge, publicKey),
    ])
    if (!challengeInfo || !participantInfo) {
      setStake(null)
      return
    }
    try {
      const c = coder.decode('Challenge', challengeInfo.data) as {
        finalized: boolean
        total_deposited: { toString(): string }
        carry_over: { toString(): string }
        winner_shares: { toString(): string }
      }
      const p = coder.decode('Participant', participantInfo.data) as {
        multiply: number
        amount_paid: { toString(): string }
        days_completed: number
        claimed: boolean
      }
      const fullMask = (1 << data.days.length) - 1
      const passedEveryDay = p.days_completed === fullMask
      const warnings = warningInfo ? (coder.decode('Warning', warningInfo.data) as { count: number }).count : 0
      const warnedOut = warnings >= MAX_WARNINGS
      const winnerShares = Number(c.winner_shares.toString())
      const prizePool =
        Number(c.total_deposited.toString()) * PRIZE_POOL_SHARE + Number(c.carry_over.toString())
      const payout =
        c.finalized && passedEveryDay && !warnedOut && winnerShares > 0
          ? Math.floor((prizePool * p.multiply) / winnerShares / PAYOUT_UNIT) * PAYOUT_UNIT
          : null

      setStake({
        multiply: p.multiply,
        paidUsdc: Number(p.amount_paid.toString()) / 10 ** USDC_DECIMALS,
        passedEveryDay,
        warnings,
        warnedOut,
        claimed: p.claimed,
        finalized: c.finalized,
        payoutUsdc: payout === null ? null : payout / 10 ** USDC_DECIMALS,
      })
    } catch {
      setStake(null)
    }
  }, [connection, publicKey])

  useEffect(() => {
    load()
    const timer = setInterval(load, 30_000)
    return () => clearInterval(timer)
  }, [load])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  if (!progress || !publicKey || !progress.registered) {
    const shown = running ?? upcoming
    const today = running ? Math.floor((now - running.startMs) / CHALLENGE.dayMs) : null
    return (
      <>
        <DayGrid track={CHALLENGE} startMs={shown.startMs} days={emptyDays} goalSeconds={0} today={today} />
        {!publicKey ? (
          <p className="card-empty card-center">
            Connect your wallet and join the next challenge!
          </p>
        ) : running ? (
          <>
            <p className="card-subject">{running.label} · running</p>
            <dl className="card-rows">
              <ChallengeDates challenge={running} />
              <dt>participants</dt>
              <dd>{runningState ? runningState.participants : '…'}</dd>
              <dt>prize pool</dt>
              <dd>{runningState ? `${runningState.prizePool.toFixed(2)} USDC` : '…'}</dd>
              <dt>winners so far</dt>
              <dd>{runningState?.winners ?? '…'}</dd>
            </dl>
          </>
        ) : (
          <p className="card-empty">No challenge running yet.</p>
        )}
        {publicKey && <p className="card-note">You haven't joined a challenge yet.</p>}
      </>
    )
  }

  const track = trackConfig(progress.track)
  const startMs = track.launchMs + progress.challengeId * track.durationMs
  const claimDeadlineMs = startMs + track.durationMs + CLAIM_WINDOW_MS
  const claimWindowClosed = now >= claimDeadlineMs
  const claimed = Boolean(stake?.claimed) || claim.kind === 'done'
  const claimable = Boolean(
    stake?.finalized && stake.passedEveryDay && !stake.warnedOut && !claimed && !claimWindowClosed,
  )
  const warningsNote = stake?.warnings ? `Warnings ${stake.warnings}/${MAX_WARNINGS} · ` : ''
  const challengeShown: Challenge = {
    id: progress.challengeId,
    track: progress.track,
    label: `${track.name} #${progress.challengeId}`,
    startMs,
    endMs: startMs + track.durationMs,
  }

  const sendClaim = async () => {
    setClaim({ kind: 'sending' })
    try {
      await claimReward(progress.track, progress.challengeId)
      setClaim({ kind: 'done' })
      load()
    } catch (err) {
      setClaim({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <>
      <DayGrid
        track={track}
        startMs={startMs}
        days={progress.days}
        goalSeconds={progress.goalSeconds}
        today={progress.currentDay}
      />

      <p className="card-subject">
        {track.name} #{progress.challengeId}
        {progress.running ? ' · running' : progress.over ? ' · finished' : ' · starts soon'}
      </p>

      <dl className="card-rows">
        <ChallengeDates challenge={challengeShown} />
        <dt>prize pool</dt>
        <dd>{joinedState ? `${joinedState.prizePool.toFixed(2)} USDC` : '…'}</dd>
        <dt>winners so far</dt>
        <dd>{joinedState?.winners ?? '…'}</dd>
        <dt>your stake</dt>
        <dd>{stake ? `${stake.multiply}x · ${stake.paidUsdc} USDC` : '…'}</dd>
        {stake?.payoutUsdc !== null && stake?.payoutUsdc !== undefined && (
          <>
            <dt>your reward</dt>
            <dd>{stake.payoutUsdc.toFixed(2)} USDC</dd>
          </>
        )}
      </dl>

      {/* Once a reward shows, its row, the deadline and the Claim button say it all. */}
      {!claimed && (stake?.payoutUsdc ?? null) === null && (
      <p className="card-note">
        {stake?.warnedOut
          ? `Out after ${MAX_WARNINGS} warnings.`
          : progress.counting
          ? `${warningsNote}Camera on — counting now.`
          : progress.over
              ? stake?.passedEveryDay
                ? stake.finalized
                  ? 'You made it. Claim now!'
                  : 'You made it. Tallying…'
                : 'Missed a day. No reward.'
              : progress.running
                ? `${warningsNote}Camera on in Discord to count.`
                : 'Starts soon. Get ready!'}
      </p>
      )}

      {claim.kind === 'error' && <p className="pay-message pay-error">{claim.message}</p>}
      <div className="card-actions">
        {/* Kept in place (only hidden) once claimed, so the card does not change height. */}
        <p className="claim-deadline" data-hidden={claimed}>
          {claimWindowClosed ? '* Claim window closed' : `* Claim by ${formatDateTime(claimDeadlineMs, zone)}`}
        </p>
        <button
          type="button"
          className="pay-button"
          data-state={claimed ? 'done' : claimable ? 'ready' : 'waiting'}
          onClick={sendClaim}
          disabled={!claimable || claim.kind === 'sending'}
        >
          {claimed ? 'Reward claimed.' : claim.kind === 'sending' ? 'Claiming…' : 'Claim reward'}
        </button>
      </div>
    </>
  )
}
