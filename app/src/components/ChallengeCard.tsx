import { useEffect, useState } from 'react'
import { useChallengeState } from '../lib/challenge'
import { formatCountdown, type Challenge } from '../lib/schedule'

type Props = {
  title: string
  challenge: Challenge | null
  /** Shown as a countdown to registration closing (= the challenge starting). */
  countdownTo?: number
  emptyText: string
}

function useCountdown(target?: number) {
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

export function ChallengeCard({ title, challenge, countdownTo, emptyText }: Props) {
  const state = useChallengeState(challenge?.id ?? -1)
  const left = useCountdown(countdownTo)

  return (
    <section className="card">
      <h2 className="card-title">{title}</h2>
      {countdownTo && (
        <p className="card-countdown" aria-label="Time left to register">
          {formatCountdown(left)}
        </p>
      )}
      {challenge ? (
        <>
          <p className="card-subject">{challenge.label}</p>
          <dl className="card-rows">
            <dt>participants</dt>
            <dd>{state ? state.participants : '…'}</dd>
            <dt>prize pool</dt>
            <dd>{state ? usdc(state.prizePool) : '…'}</dd>
          </dl>
        </>
      ) : (
        <p className="card-empty">{emptyText}</p>
      )}
    </section>
  )
}
