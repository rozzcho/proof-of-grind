import { useEffect, useState } from 'react'
import { getMe } from '../lib/api'
import { openWeeklyChallenge, runningWeeklyChallenge } from '../lib/schedule'
import { ChallengeCard } from './ChallengeCard'
import { MyChallenge } from './MyChallenge'
import { NextChallengeCard } from './NextChallengeCard'

/** Checks whether this browser has a Discord session with the server. */
function useDiscordConnected() {
  const [connected, setConnected] = useState(false)
  useEffect(() => {
    const check = () =>
      getMe()
        .then((me) => setConnected(Boolean(me.discord)))
        .catch(() => setConnected(false))
    check()
    window.addEventListener('focus', check)
    const timer = setInterval(check, 30_000)
    return () => {
      window.removeEventListener('focus', check)
      clearInterval(timer)
    }
  }, [])
  return connected
}

export function StatusPanel() {
  const [now, setNow] = useState(() => Date.now())
  const discordConnected = useDiscordConnected()
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
        {discordConnected ? (
          <MyChallenge running={running} />
        ) : (
          <ChallengeCard title="Ongoing" challenge={running} emptyText="No challenge running yet." />
        )}
        <NextChallengeCard challenge={open} />
      </div>
    </section>
  )
}
