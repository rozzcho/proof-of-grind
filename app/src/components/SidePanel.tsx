import { useEffect, useState } from 'react'
import { ChallengeCard } from './ChallengeCard'
import { Clock } from './Clock'
import { MyChallenge } from './MyChallenge'
import { openWeeklyChallenge, runningWeeklyChallenge } from '../lib/schedule'

export function SidePanel() {
  const [now, setNow] = useState(() => Date.now())
  // Rolls the cards over to the next week on Monday 00:00 UTC.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const running = runningWeeklyChallenge(now)
  const open = openWeeklyChallenge(now)

  return (
    <aside className="side-panel">
      <Clock />
      <MyChallenge />
      <ChallengeCard title="Ongoing" challenge={running} emptyText="No challenge running yet." />
      <ChallengeCard title="Next Challenge" challenge={open} countdownTo={open.startMs} emptyText="" />
    </aside>
  )
}
