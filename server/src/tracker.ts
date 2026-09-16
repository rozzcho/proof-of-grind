import { DatabaseSync } from 'node:sqlite'

const DAY_MS = 24 * 60 * 60 * 1000

export function utcDay(ms: number) {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Monday 00:00 UTC of the week containing `ms`. */
export function utcWeekStart(ms: number) {
  const dayStart = Math.floor(ms / DAY_MS) * DAY_MS
  const weekday = (new Date(dayStart).getUTCDay() + 6) % 7 // Mon = 0
  return dayStart - weekday * DAY_MS
}

export type DayProgress = { day: string; seconds: number; goalMet: boolean }

/**
 * Accumulates counted voice time per Discord user per UTC day.
 * A user is "active" while counting; time is credited on stop and on periodic flushes,
 * and split at UTC midnight so each day gets only its own time.
 */
export class GrindTracker {
  readonly goalMs: number
  #db: DatabaseSync
  #active = new Map<string, number>() // discordId -> last credited timestamp (ms)

  constructor(path: string, goalSeconds: number) {
    this.goalMs = goalSeconds * 1000
    this.#db = new DatabaseSync(path)
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS daily_time (
        discord_id TEXT NOT NULL,
        day TEXT NOT NULL,
        ms INTEGER NOT NULL DEFAULT 0,
        goal_reached_at INTEGER,
        PRIMARY KEY (discord_id, day)
      )
    `)
  }

  isActive(discordId: string) {
    return this.#active.has(discordId)
  }

  start(discordId: string, now = Date.now()) {
    if (!this.#active.has(discordId)) this.#active.set(discordId, now)
  }

  stop(discordId: string, now = Date.now()) {
    const last = this.#active.get(discordId)
    if (last === undefined) return
    this.#credit(discordId, last, now)
    this.#active.delete(discordId)
  }

  /** Credits time for everyone currently counting, so a crash loses at most one interval. */
  flush(now = Date.now()) {
    for (const [discordId, last] of this.#active) {
      this.#credit(discordId, last, now)
      this.#active.set(discordId, now)
    }
  }

  stopAll(now = Date.now()) {
    for (const discordId of [...this.#active.keys()]) this.stop(discordId, now)
  }

  week(discordId: string, now = Date.now()): DayProgress[] {
    const start = utcWeekStart(now)
    const rows = this.#db
      .prepare('SELECT day, ms FROM daily_time WHERE discord_id = ? AND day >= ? AND day <= ?')
      .all(discordId, utcDay(start), utcDay(start + 6 * DAY_MS)) as { day: string; ms: number }[]
    const byDay = new Map(rows.map((r) => [r.day, r.ms]))

    // Include not-yet-flushed time for today.
    const last = this.#active.get(discordId)
    if (last !== undefined && utcDay(last) === utcDay(now)) {
      byDay.set(utcDay(now), (byDay.get(utcDay(now)) ?? 0) + (now - last))
    }

    return Array.from({ length: 7 }, (_, i) => {
      const day = utcDay(start + i * DAY_MS)
      const ms = byDay.get(day) ?? 0
      return { day, seconds: Math.floor(ms / 1000), goalMet: ms >= this.goalMs }
    })
  }

  #credit(discordId: string, from: number, to: number) {
    const upsert = this.#db.prepare(`
      INSERT INTO daily_time (discord_id, day, ms) VALUES (?, ?, ?)
      ON CONFLICT (discord_id, day) DO UPDATE SET ms = ms + excluded.ms
      RETURNING ms, goal_reached_at
    `)
    const markGoal = this.#db.prepare('UPDATE daily_time SET goal_reached_at = ? WHERE discord_id = ? AND day = ?')

    while (from < to) {
      const segmentEnd = Math.min(to, (Math.floor(from / DAY_MS) + 1) * DAY_MS)
      const day = utcDay(from)
      const row = upsert.get(discordId, day, segmentEnd - from) as { ms: number; goal_reached_at: number | null }
      if (row.ms >= this.goalMs && row.goal_reached_at === null) {
        markGoal.run(segmentEnd, discordId, day)
        console.log(`[tracker] ${discordId} reached the daily goal for ${day}`)
      }
      from = segmentEnd
    }
  }
}
