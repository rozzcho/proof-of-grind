import { useCallback, useEffect, useState } from 'react'
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { AnchorProvider, BorshAccountsCoder, Program, type Idl } from '@anchor-lang/core'
import { Transaction } from '@solana/web3.js'
import idl from '../idl/proof_of_grind.json'
import { CHALLENGE, USDC_DECIMALS, USDC_MINT } from '../config'
import { getProgress, type Progress } from '../lib/api'
import { PRIZE_POOL_SHARE, useChallengeState } from '../lib/challenge'
import { challengePda, participantPda, usdcAta } from '../lib/program'
import { formatCountdown, type Challenge } from '../lib/schedule'
import { signAndConfirm } from '../lib/send'

type Claim = { kind: 'idle' } | { kind: 'sending' } | { kind: 'done' } | { kind: 'error'; message: string }

// Account fields keep the program's snake_case names.
const coder = new BorshAccountsCoder(idl as unknown as Idl)
const PAYOUT_UNIT = 10_000 // rewards are rounded down to 0.01 USDC

type Stake = {
  multiply: number
  paidUsdc: number
  passedEveryDay: boolean
  claimed: boolean
  finalized: boolean
  /** What this participant gets if they won; null until the challenge is settled. */
  payoutUsdc: number | null
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const hours = (seconds: number) => `${(seconds / 3600).toFixed(1)}h`

function dayLabel(index: number, challengeStartMs: number) {
  if (CHALLENGE.dayMs !== 24 * 60 * 60 * 1000) return String(index + 1)
  const day = new Date(challengeStartMs + index * CHALLENGE.dayMs).getUTCDay()
  return WEEKDAYS[(day + 6) % 7]
}

/**
 * Shown once Discord is connected. Before joining it shows the running challenge; after joining,
 * your progress, what you staked, and the Claim button once it is settled.
 */
export function MyChallenge({ running }: { running: Challenge | null }) {
  const { connection } = useConnection()
  const { publicKey, signTransaction } = useWallet()
  const anchorWallet = useAnchorWallet()
  const [progress, setProgress] = useState<Progress | null>(null)
  const [stake, setStake] = useState<Stake | null>(null)
  const [claim, setClaim] = useState<Claim>({ kind: 'idle' })
  const [now, setNow] = useState(() => Date.now())
  const runningState = useChallengeState(running?.id ?? -1)

  const load = useCallback(async () => {
    const data = await getProgress().catch(() => null)
    setProgress(data)
    if (!data || !publicKey) return

    const challenge = challengePda(CHALLENGE.track, data.challengeId)
    const [challengeInfo, participantInfo] = await Promise.all([
      connection.getAccountInfo(challenge),
      connection.getAccountInfo(participantPda(challenge, publicKey)),
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
      const winnerShares = Number(c.winner_shares.toString())
      const prizePool =
        Number(c.total_deposited.toString()) * PRIZE_POOL_SHARE + Number(c.carry_over.toString())
      const payout =
        c.finalized && passedEveryDay && winnerShares > 0
          ? Math.floor((prizePool * p.multiply) / winnerShares / PAYOUT_UNIT) * PAYOUT_UNIT
          : null

      setStake({
        multiply: p.multiply,
        paidUsdc: Number(p.amount_paid.toString()) / 10 ** USDC_DECIMALS,
        passedEveryDay,
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
    return (
      <section className="card">
        <h2 className="card-title">My Challenge</h2>
        {running ? (
          <>
            <p className="card-subject">{running.label} · running</p>
            <dl className="card-rows">
              <dt>participants</dt>
              <dd>{runningState ? runningState.participants : '…'}</dd>
              <dt>prize pool</dt>
              <dd>{runningState ? `${runningState.prizePool.toFixed(2)} USDC` : '…'}</dd>
            </dl>
          </>
        ) : (
          <p className="card-empty">No challenge running yet.</p>
        )}
        <p className="card-note">
          {publicKey ? "You haven't joined a challenge yet." : 'Connect your wallet to see your progress.'}
        </p>
      </section>
    )
  }

  const claimed = Boolean(stake?.claimed) || claim.kind === 'done'
  const claimable = Boolean(stake?.finalized && stake.passedEveryDay && !claimed)
  const startMs = CHALLENGE.launchMs + progress.challengeId * CHALLENGE.durationMs
  const today = progress.currentDay === null ? null : progress.days[progress.currentDay]
  const dayEndsMs = progress.currentDay === null ? null : startMs + (progress.currentDay + 1) * CHALLENGE.dayMs
  const passedDays = progress.days.filter((day) => day.goalMet).length

  const sendClaim = async () => {
    if (!signTransaction || !anchorWallet) return
    setClaim({ kind: 'sending' })
    try {
      const challenge = challengePda(CHALLENGE.track, progress.challengeId)
      const provider = new AnchorProvider(connection, anchorWallet, { commitment: 'confirmed' })
      const program = new Program(idl as unknown as Idl, provider)
      const ix = await program.methods
        .claim()
        .accountsPartial({
          user: publicKey,
          challenge,
          participant: participantPda(challenge, publicKey),
          mint: USDC_MINT,
          userTokenAccount: usdcAta(publicKey),
          vault: usdcAta(challenge),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction()
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
      const tx = new Transaction({ feePayer: publicKey, blockhash, lastValidBlockHeight }).add(ix)
      await signAndConfirm(
        connection,
        signTransaction,
        tx.serialize({ requireAllSignatures: false }),
        lastValidBlockHeight,
      )
      setClaim({ kind: 'done' })
      load()
    } catch (err) {
      setClaim({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <section className="card">
      <h2 className="card-title">My Challenge</h2>
      <ol className="day-grid">
        {progress.days.map((day) => {
          const fill = Math.min(1, day.seconds / progress.goalSeconds)
          return (
            <li
              key={day.dayIndex}
              className="day"
              data-state={day.goalMet ? 'passed' : fill > 0 ? 'partial' : 'open'}
              data-today={day.dayIndex === progress.currentDay || undefined}
              style={{ '--fill': `${fill * 100}%` } as React.CSSProperties}
              title={`${dayLabel(day.dayIndex, startMs)} · ${hours(day.seconds)} of ${hours(progress.goalSeconds)}`}
            >
              {dayLabel(day.dayIndex, startMs)}
            </li>
          )
        })}
      </ol>

      <p className="card-subject">
        {CHALLENGE.name} #{progress.challengeId}
        {progress.running ? ' · running' : progress.over ? ' · finished' : ' · starts soon'}
      </p>

      {today && dayEndsMs && (
        <dl className="card-rows">
          <dt>today</dt>
          <dd>
            {hours(today.seconds)} / {hours(progress.goalSeconds)}
          </dd>
          <dt>day ends in</dt>
          <dd>{formatCountdown(dayEndsMs - now)}</dd>
        </dl>
      )}

      <dl className="card-rows">
        <dt>your stake</dt>
        <dd>
          {stake ? `${stake.multiply}x · ${stake.paidUsdc} USDC` : '…'}
        </dd>
        <dt>days passed</dt>
        <dd>
          {passedDays} / {progress.days.length}
        </dd>
        {stake?.payoutUsdc !== null && stake?.payoutUsdc !== undefined && (
          <>
            <dt>your reward</dt>
            <dd>{stake.payoutUsdc.toFixed(2)} USDC</dd>
          </>
        )}
      </dl>

      {!claimed && (
      <p className="card-note">
        {progress.counting
          ? 'Camera on — counting now.'
          : progress.over
              ? stake?.passedEveryDay
                ? stake.finalized
                  ? 'You made it. Claim your reward.'
                  : 'You made it. Counting everyone up…'
                : 'Missed a day, so no reward this time.'
              : progress.running
                ? 'Join the voice channel and turn your camera on.'
                : 'Starts soon. Camera time counts from day 1.'}
      </p>
      )}

      {claim.kind === 'error' && <p className="pay-message pay-error">{claim.message}</p>}
      <div className="card-actions">
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
    </section>
  )
}
