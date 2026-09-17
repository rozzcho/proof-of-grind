import { useEffect, useState, type ReactNode } from 'react'
import { useChallengeState } from '../lib/challenge'
import { formatCountdown, type Challenge } from '../lib/schedule'
import { formatDateTime, useTimeZoneMode } from '../lib/timeZone'

type Props = {
  /** Card title; left out for a second section inside the same card. */
  title?: string
  challenge: Challenge | null
  /** Shown as a countdown to registration closing (= the challenge starting). */
  countdownTo?: number
  emptyText: string
  /** Actions shown at the bottom of the card, e.g. a Register button. */
  children?: ReactNode
}

export function useCountdown(target?: number) {
  const [left, setLeft] = useState(() => (target ? target - Date.now() : 0))
  useEffect(() => {
    if (!target) return
    setLeft(target - Date.now())
    const timer = setInterval(() => setLeft(target - Date.now()), 1000)
    return () => clearInterval(timer)
  }, [target])
  return left
}

function usdc(amount: number) {
  return `${amount.toFixed(2)} USDC`
}

/** The "- date" row: start and end in local time or UTC, switched by the button. */
export function ChallengeDates({ challenge }: { challenge: Challenge }) {
  const [zone, toggleZone] = useTimeZoneMode()
  // The last minute of the challenge, matching "Sunday 23:59" in the rules.
  const lastMinuteMs = challenge.endMs - 60_000
  return (
    <>
      <dt>
        date{' '}
        <button
          type="button"
          className="zone-toggle"
          onClick={toggleZone}
          aria-label={`Showing ${zone === 'utc' ? 'UTC' : 'local time'}. Switch.`}
        >
          {zone === 'utc' ? 'utc' : 'local'}
        </button>
      </dt>
      <dd className="card-dates">
        {formatDateTime(challenge.startMs, zone)} ~ {formatDateTime(lastMinuteMs, zone)}
      </dd>
    </>
  )
}

/** The card's content without its frame. */
export function ChallengeCardBody({ title, challenge, countdownTo, emptyText, children }: Props) {
  const state = useChallengeState(challenge?.id ?? -1, { track: challenge?.track })
  const left = useCountdown(countdownTo)

  return (
    <>
      {title && <h2 className="card-title">{title}</h2>}
      {countdownTo && (
        <p className="card-countdown" aria-label="Time left to register">
          {formatCountdown(left)}
        </p>
      )}
      {challenge ? (
        <>
          <p className="card-subject">{challenge.label}</p>
          <dl className="card-rows">
            <ChallengeDates challenge={challenge} />
            <dt>participants</dt>
            <dd>{state ? state.participants : '…'}</dd>
            <dt>prize pool</dt>
            <dd>{state ? usdc(state.prizePool) : '…'}</dd>
          </dl>
        </>
      ) : (
        <p className="card-empty">{emptyText}</p>
      )}
      {children && <div className="card-actions">{children}</div>}
    </>
  )
}
