import { CHALLENGE, type TrackConfig } from '../config'

export type Challenge = { track: number; id: number; label: string; startMs: number; endMs: number }

export function challengeOn(track: TrackConfig, id: number): Challenge {
  const startMs = track.launchMs + id * track.durationMs
  return { track: track.track, id, label: `${track.name} #${id}`, startMs, endMs: startMs + track.durationMs }
}

/** The challenge taking registrations on a track: the next one to start. */
export function openChallenge(track: TrackConfig, now = Date.now()): Challenge {
  return challengeOn(track, now < track.launchMs ? 0 : Math.floor((now - track.launchMs) / track.durationMs) + 1)
}

/** The challenge being run on a track, or null before the first one starts. */
export function runningChallenge(track: TrackConfig, now = Date.now()): Challenge | null {
  return now < track.launchMs ? null : challengeOn(track, Math.floor((now - track.launchMs) / track.durationMs))
}

/** The site's main track (Weekly; the test track locally). */
export function openWeeklyChallenge(now = Date.now()) {
  return openChallenge(CHALLENGE, now)
}

export function runningWeeklyChallenge(now = Date.now()) {
  return runningChallenge(CHALLENGE, now)
}

/** Seconds left as HH:MM:SS, counting hours past 24 (e.g. 56:45:03). */
export function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const parts = [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60]
  return parts.map((n) => String(n).padStart(2, '0')).join(':')
}
