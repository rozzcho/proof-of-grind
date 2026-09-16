import { useEffect, useState } from 'react'
import { openWeeklyChallenge, runningWeeklyChallenge } from '../lib/schedule'
import { MyChallenge } from './MyChallenge'
import { NextChallengeCard } from './NextChallengeCard'

export function StatusPanel() {
  const [now, setNow] = useState(() => Date.now())
  // Rolls the cards over to the next challenge when one starts.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const running = runningWeeklyChallenge(now)
  const open = openWeeklyChallenge(now)

  return (
    <section className="status" aria-label="Challenges">
      <div className="cards">
        <MyChallenge running={running} upcoming={open} />
        <NextChallengeCard challenge={open} />
      </div>
    </section>
  )
}
