import { useCallback, useEffect, useState } from 'react'
import { DISCORD_LOGIN_URL, getStaffOverview, staffCreditDay, staffSendSol, type StaffChallenge, type StaffOverview, type StaffParticipant } from '../lib/api'
import { formatDateTime, useTimeZoneMode } from '../lib/timeZone'

const hours = (seconds: number) => `${(seconds / 3600).toFixed(1)}h`
const shorten = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`

type Action = { kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; text: string } | { kind: 'error'; text: string }

/** What a challenge is doing right now, in words. */
function phase(challenge: StaffChallenge, now: number) {
  if (now < challenge.startMs) return 'registration open'
  if (now < challenge.endMs) return 'running'
  if (challenge.finalized) return challenge.claimed >= challenge.winnerCount ? 'settled' : 'claims open'
  return now < challenge.resultsOpenMs ? 'recording window' : 'waiting for tally'
}

/**
 * The page for running the challenges: who joined, how they are doing, what the server is up to,
 * and the two actions that used to need a terminal (sending SOL, crediting a day).
 */
export function StaffPage() {
  const [overview, setOverview] = useState<StaffOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [zone, toggleZone] = useTimeZoneMode()

  const load = useCallback(async () => {
    try {
      setOverview(await getStaffOverview())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, 20_000)
    return () => clearInterval(timer)
  }, [load])

  if (error) {
    return (
      <main className="page staff">
        <h1 className="staff-title">Staff</h1>
        <p className="pay-message pay-error">{error}</p>
        <p>
          <a className="pay-link" href={DISCORD_LOGIN_URL}>
            Sign in with Discord
          </a>{' '}
          with a staff account, then reload.
        </p>
      </main>
    )
  }

  if (!overview) {
    return (
      <main className="page staff">
        <h1 className="staff-title">Staff</h1>
        <p className="card-empty">Loading…</p>
      </main>
    )
  }

  const { server, now } = overview

  return (
    <main className="page staff">
      <div className="card-head">
        <a className="card-back" href="/">
          ← Site
        </a>
        <h1 className="staff-title">Staff</h1>
        <button type="button" className="zone-toggle card-head-end" onClick={toggleZone}>
          {zone}
        </button>
      </div>

      <section className="staff-block">
        <h2 className="staff-heading">Server</h2>
        <dl className="card-rows">
          <dt>bot</dt>
          <dd>
            {server.bot.healthy ? 'ok' : 'check it'} · {server.bot.ready ? 'connected' : 'disconnected'} · saved{' '}
            {server.bot.lastFlushSecondsAgo ?? '–'}s ago
          </dd>
          <dt>oracle</dt>
          <dd>
            {shorten(server.oracle)} · {server.oracleSol?.toFixed(3) ?? '–'} SOL
          </dd>
          <dt>faucet</dt>
          <dd>
            {server.faucet ? shorten(server.faucet) : 'none'} · {server.faucetSol?.toFixed(3) ?? '–'} SOL
          </dd>
          <dt>outages</dt>
          <dd>
            {server.outages.length === 0
              ? 'none'
              : server.outages
                  .slice(-3)
                  .map((outage) => `${formatDateTime(outage.startMs, zone)} (${Math.round((outage.endMs - outage.startMs) / 60_000)}m)`)
                  .join(', ')}
          </dd>
        </dl>
        <SendSol maxSol={server.faucetMaxSol} onDone={load} />
      </section>

      {overview.challenges.map((challenge) => (
        <ChallengeBlock
          key={`${challenge.track}:${challenge.challengeId}`}
          challenge={challenge}
          now={now}
          goalSeconds={overview.goalSeconds}
          zone={zone}
          onDone={load}
        />
      ))}

      <section className="staff-block">
        <h2 className="staff-heading">Reports</h2>
        {overview.reports.length === 0 ? (
          <p className="card-empty">No reports yet.</p>
        ) : (
          <div className="staff-scroll">
            <table className="staff-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>opened</th>
                  <th>target</th>
                  <th>reason</th>
                  <th>jury</th>
                  <th>status</th>
                </tr>
              </thead>
              <tbody>
                {overview.reports.map((report) => (
                  <tr key={report.id}>
                    <td>{report.id}</td>
                    <td>{formatDateTime(report.createdAt, zone)}</td>
                    <td>{report.names[report.targetId] ?? report.targetId}</td>
                    <td>{report.reason ?? '–'}</td>
                    <td>
                      {report.jurors.filter((j) => j.vote === 'uphold').length} uphold ·{' '}
                      {report.jurors.filter((j) => j.vote === 'dismiss').length} dismiss ·{' '}
                      {report.jurors.filter((j) => j.vote === null && !j.expired).length} waiting
                    </td>
                    <td>
                      {report.status}
                      {report.status === 'upheld' && !report.warned ? ' (warning pending)' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}

function ChallengeBlock({
  challenge,
  now,
  goalSeconds,
  zone,
  onDone,
}: {
  challenge: StaffChallenge
  now: number
  goalSeconds: number
  zone: 'local' | 'utc'
  onDone: () => void
}) {
  return (
    <section className="staff-block">
      <h2 className="staff-heading">
        {challenge.name} #{challenge.challengeId} · {phase(challenge, now)}
      </h2>
      <dl className="card-rows">
        <dt>dates</dt>
        <dd>
          {formatDateTime(challenge.startMs, zone)} ~ {formatDateTime(challenge.endMs - 60_000, zone)}
        </dd>
        <dt>results open</dt>
        <dd>{formatDateTime(challenge.resultsOpenMs, zone)}</dd>
        <dt>entry pool</dt>
        <dd>
          {challenge.entryPoolUsdc.toFixed(2)} USDC
          {challenge.carryOverUsdc > 0 ? ` (+${challenge.carryOverUsdc.toFixed(2)} rolled over)` : ''}
        </dd>
        <dt>settlement</dt>
        <dd>
          {challenge.finalized ? 'finalized' : `tallied ${challenge.tallied}/${challenge.participants.length}`} ·{' '}
          {challenge.winnerCount} winners · {challenge.claimed} claimed
          {challenge.rolledOver ? ' · rolled over' : ''}
        </dd>
      </dl>

      {challenge.participants.length === 0 ? (
        <p className="card-empty">Nobody registered yet.</p>
      ) : (
        <div className="staff-scroll">
          <table className="staff-table">
            <thead>
              <tr>
                <th>who</th>
                <th>wallet</th>
                <th>stake</th>
                <th>days</th>
                <th>today</th>
                <th>state</th>
                <th>credit a day</th>
              </tr>
            </thead>
            <tbody>
              {challenge.participants.map((participant) => (
                <ParticipantRow
                  key={participant.wallet}
                  challenge={challenge}
                  participant={participant}
                  now={now}
                  goalSeconds={goalSeconds}
                  onDone={onDone}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function ParticipantRow({
  challenge,
  participant,
  now,
  goalSeconds,
  onDone,
}: {
  challenge: StaffChallenge
  participant: StaffParticipant
  now: number
  goalSeconds: number
  onDone: () => void
}) {
  const [action, setAction] = useState<Action>({ kind: 'idle' })
  const dayMs = (challenge.endMs - challenge.startMs) / challenge.days
  const currentDay = now >= challenge.startMs && now < challenge.endMs ? Math.floor((now - challenge.startMs) / dayMs) : null
  const today = currentDay === null ? null : participant.days[currentDay]

  const credit = async (dayIndex: number) => {
    setAction({ kind: 'busy' })
    try {
      await staffCreditDay(challenge.track, challenge.challengeId, participant.discordId, dayIndex)
      setAction({ kind: 'done', text: `day ${dayIndex + 1} credited` })
      onDone()
    } catch (err) {
      setAction({ kind: 'error', text: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <tr>
      <td>
        {participant.name ?? participant.discordId}
        {participant.counting ? ' · on camera' : ''}
        {participant.warnings > 0 ? ` · ${participant.warnings} warning(s)` : ''}
      </td>
      <td>{shorten(participant.wallet)}</td>
      <td>
        {participant.multiply}x · {participant.paidUsdc} USDC
      </td>
      <td>
        {participant.daysPassed}/{challenge.days} passed · {participant.recorded} on chain
      </td>
      <td>{today ? `${hours(today.seconds)} / ${hours(today.goalSeconds ?? goalSeconds)}` : '–'}</td>
      <td>
        {participant.tallied ? (participant.passedEveryDay ? 'winner' : 'missed') : 'not tallied'}
        {participant.claimed ? ' · claimed' : ''}
      </td>
      <td>
        <span className="staff-credit">
          {participant.days.map((day) => (
            <button
              key={day.dayIndex}
              type="button"
              className="zone-toggle"
              title={`Mark day ${day.dayIndex + 1} as passed (${hours(day.seconds)} counted)`}
              disabled={day.recorded || action.kind === 'busy'}
              onClick={() => credit(day.dayIndex)}
            >
              {day.dayIndex + 1}
            </button>
          ))}
        </span>
        {action.kind === 'done' && <span className="staff-note"> {action.text}</span>}
        {action.kind === 'error' && <span className="staff-note pay-error"> {action.text}</span>}
      </td>
    </tr>
  )
}

function SendSol({ maxSol, onDone }: { maxSol: number; onDone: () => void }) {
  const [wallet, setWallet] = useState('')
  const [sol, setSol] = useState('0.05')
  const [action, setAction] = useState<Action>({ kind: 'idle' })

  const send = async () => {
    setAction({ kind: 'busy' })
    try {
      const result = await staffSendSol(wallet.trim(), Number(sol))
      setAction({ kind: 'done', text: `Sent ${result.sol} SOL. Their balance is now ${result.balance.toFixed(3)} SOL.` })
      setWallet('')
      onDone()
    } catch (err) {
      setAction({ kind: 'error', text: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <div className="staff-form">
      <label>
        <span>Send SOL to</span>
        <input
          id="staff-sol-wallet"
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          placeholder="wallet address"
          spellCheck={false}
        />
      </label>
      <label>
        <span>SOL</span>
        <input
          id="staff-sol-amount"
          value={sol}
          onChange={(e) => setSol(e.target.value)}
          inputMode="decimal"
          size={5}
        />
      </label>
      <button
        type="button"
        className="pay-button staff-send"
        onClick={send}
        disabled={action.kind === 'busy' || wallet.trim().length < 32 || !(Number(sol) > 0 && Number(sol) <= maxSol)}
      >
        {action.kind === 'busy' ? 'Sending…' : 'Send'}
      </button>
      <p className={action.kind === 'error' ? 'staff-note pay-error' : 'staff-note'}>
        {action.kind === 'done' || action.kind === 'error' ? action.text : `Up to ${maxSol} SOL at a time.`}
      </p>
    </div>
  )
}
