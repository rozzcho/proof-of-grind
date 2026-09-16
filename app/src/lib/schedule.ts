import { useEffect, useState } from 'react'
import { WEEKLY } from '../config'

export type Challenge = { id: number; label: string; startMs: number; endMs: number }
export type OpenChallenge = Challenge

function weekly(id: number): Challenge {
  const startMs = WEEKLY.launchMs + id * WEEKLY.weekMs
  return { id, label: `Weekly Challenge #${id}`, startMs, endMs: startMs + WEEKLY.weekMs }
}

/** The weekly challenge taking registrations: it starts next Monday 00:00 UTC. */
export function openWeeklyChallenge(now = Date.now()): Challenge {
  return weekly(now < WEEKLY.launchMs ? 0 : Math.floor((now - WEEKLY.launchMs) / WEEKLY.weekMs) + 1)
}

/** The challenge being run this week, or null before the first one starts. */
export function runningWeeklyChallenge(now = Date.now()): Challenge | null {
  return now < WEEKLY.launchMs ? null : weekly(Math.floor((now - WEEKLY.launchMs) / WEEKLY.weekMs))
}

/** Seconds left as HH:MM:SS, counting hours past 24 (e.g. 56:45:03). */
export function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const parts = [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60]
  return parts.map((n) => String(n).padStart(2, '0')).join(':')
}

/** Re-evaluates every 30s so the label rolls over to the next week on Monday 00:00 UTC. */
export function useOpenWeeklyChallenge() {
  const [challenge, setChallenge] = useState(() => openWeeklyChallenge())
  useEffect(() => {
    const timer = setInterval(() => {
      setChallenge((current) => {
        const next = openWeeklyChallenge()
        return next.id === current.id ? current : next
      })
    }, 30_000)
    return () => clearInterval(timer)
  }, [])
  return challenge
}
