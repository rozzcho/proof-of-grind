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

/** Which challenge day a moment belongs to; `endMs` is when that day ends. */
export type Slot = {
  track: number
  challengeId: number
  dayIndex: number
  endMs: number
  /** When the challenge day began; lets server outages come off that day's goal. */
  startMs?: number
}
export type SlotResolver = (discordId: string, atMs: number) => Slot | null

export type PendingRecord = { discordId: string; track: number; challengeId: number; dayIndex: number }
export type ChallengeDay = {
  dayIndex: number
  seconds: number
  /** The daily goal for this day, less any server outage during it. */
  goalSeconds: number
  goalMet: boolean
  recorded: boolean
}
/** Start and end (ms) of a challenge day. */
export type DayWindow = (track: number, challengeId: number, dayIndex: number) => [number, number] | null

/**
 * Accumulates counted voice time per Discord user per UTC day.
 * A user is "active" while counting; time is credited on stop and on periodic flushes,
 * and split at UTC midnight so each day gets only its own time.
 */
export class GrindTracker {
  readonly goalMs: number
  #db: DatabaseSync
  #active = new Map<string, number>() // discordId -> last credited timestamp (ms)
  #slotOf: SlotResolver = () => null

  constructor(path: string, goalSeconds: number, slotOf?: SlotResolver) {
    this.goalMs = goalSeconds * 1000
    if (slotOf) this.#slotOf = slotOf
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
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS faucet_claims (
        discord_id TEXT PRIMARY KEY,
        wallet TEXT NOT NULL UNIQUE,
        lamports INTEGER NOT NULL,
        claimed_at INTEGER NOT NULL
      )
    `)
    // Periods the server was down or disconnected from Discord: that time comes off the daily goal.
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS outages (
        start_ms INTEGER NOT NULL,
        end_ms INTEGER NOT NULL
      )
    `)
    // Last moment the server was known to be up, to find downtime after a crash.
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS heartbeat (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        at INTEGER NOT NULL
      )
    `)
    // Same time, bucketed by challenge day — this is what gets recorded on chain.
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS challenge_progress (
        discord_id TEXT NOT NULL,
        track INTEGER NOT NULL,
        challenge_id INTEGER NOT NULL,
        day_index INTEGER NOT NULL,
        ms INTEGER NOT NULL DEFAULT 0,
        goal_reached_at INTEGER,
        recorded_at INTEGER,
        PRIMARY KEY (discord_id, track, challenge_id, day_index)
      )
    `)
  }

  /** Records that a Discord account received test SOL; false if it already had some. */
  claimFaucet(discordId: string, wallet: string, lamports: number, now = Date.now()) {
    const taken = this.#db
      .prepare('SELECT discord_id FROM faucet_claims WHERE discord_id = ? OR wallet = ?')
      .get(discordId, wallet)
    if (taken) return false
    this.#db
      .prepare('INSERT INTO faucet_claims (discord_id, wallet, lamports, claimed_at) VALUES (?, ?, ?, ?)')
      .run(discordId, wallet, lamports, now)
    return true
  }

  heartbeat(now = Date.now()) {
    this.#db
      .prepare('INSERT INTO heartbeat (id, at) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET at = excluded.at')
      .run(now)
  }

  lastHeartbeat() {
    const row = this.#db.prepare('SELECT at FROM heartbeat WHERE id = 1').get() as { at: number } | undefined
    return row?.at ?? null
  }

  recordOutage(startMs: number, endMs: number) {
    if (endMs <= startMs) return
    this.#db.prepare('INSERT INTO outages (start_ms, end_ms) VALUES (?, ?)').run(startMs, endMs)
  }

  outages() {
    return this.#db.prepare('SELECT start_ms, end_ms FROM outages ORDER BY start_ms').all() as {
      start_ms: number
      end_ms: number
    }[]
  }

  /** Outage time inside [startMs, endMs). */
  outageMs(startMs: number, endMs: number) {
    const row = this.#db
      .prepare(
        `SELECT COALESCE(SUM(MIN(end_ms, ?) - MAX(start_ms, ?)), 0) AS ms FROM outages
         WHERE start_ms < ? AND end_ms > ?`,
      )
      .get(endMs, startMs, endMs, startMs) as { ms: number }
    return row.ms
  }

  /** The daily goal for a day window, less the time the server was down during it. */
  goalMsFor(startMs: number, endMs: number) {
    return Math.max(0, this.goalMs - this.outageMs(startMs, endMs))
  }

  /**
   * After an outage is recorded: days whose time now meets their lowered goal are marked passed,
   * so they get recorded on chain like any other.
   */
  reevaluate(windowOf: DayWindow, now = Date.now()) {
    const rows = this.#db
      .prepare(
        `SELECT discord_id, track, challenge_id, day_index, ms FROM challenge_progress WHERE goal_reached_at IS NULL`,
      )
      .all() as { discord_id: string; track: number; challenge_id: number; day_index: number; ms: number }[]
    let passed = 0
    for (const row of rows) {
      const window = windowOf(row.track, row.challenge_id, row.day_index)
      if (!window || row.ms < this.goalMsFor(...window)) continue
      this.#db
        .prepare(
          `UPDATE challenge_progress SET goal_reached_at = ?
           WHERE discord_id = ? AND track = ? AND challenge_id = ? AND day_index = ?`,
        )
        .run(now, row.discord_id, row.track, row.challenge_id, row.day_index)
      passed++
    }
    return passed
  }

  /** Tells the tracker which challenge day a participant's time belongs to. */
  setSlotResolver(slotOf: SlotResolver) {
    this.#slotOf = slotOf
  }

  /** Days that hit the goal but are not on chain yet. */
  pendingRecords(): PendingRecord[] {
    const rows = this.#db
      .prepare(
        `SELECT discord_id, track, challenge_id, day_index FROM challenge_progress
         WHERE goal_reached_at IS NOT NULL AND recorded_at IS NULL`,
      )
      .all() as { discord_id: string; track: number; challenge_id: number; day_index: number }[]
    return rows.map((r) => ({
      discordId: r.discord_id,
      track: r.track,
      challengeId: r.challenge_id,
      dayIndex: r.day_index,
    }))
  }

  markRecorded(record: PendingRecord, now = Date.now()) {
    this.#db
      .prepare(
        `UPDATE challenge_progress SET recorded_at = ?
         WHERE discord_id = ? AND track = ? AND challenge_id = ? AND day_index = ?`,
      )
      .run(now, record.discordId, record.track, record.challengeId, record.dayIndex)
  }

  /** Per-day progress for one challenge. */
  challenge(discordId: string, track: number, challengeId: number, days: number, windowOf?: DayWindow): ChallengeDay[] {
    const rows = this.#db
      .prepare(
        `SELECT day_index, ms, goal_reached_at, recorded_at FROM challenge_progress
         WHERE discord_id = ? AND track = ? AND challenge_id = ?`,
      )
      .all(discordId, track, challengeId) as {
      day_index: number
      ms: number
      goal_reached_at: number | null
      recorded_at: number | null
    }[]
    const byDay = new Map(rows.map((r) => [r.day_index, r]))
    return Array.from({ length: days }, (_, dayIndex) => {
      const row = byDay.get(dayIndex)
      const window = windowOf?.(track, challengeId, dayIndex)
      const goalMs = window ? this.goalMsFor(...window) : this.goalMs
      return {
        dayIndex,
        seconds: Math.floor((row?.ms ?? 0) / 1000),
        goalSeconds: Math.floor(goalMs / 1000),
        goalMet: row?.goal_reached_at != null || (row?.ms ?? 0) >= goalMs,
        recorded: row?.recorded_at != null,
      }
    })
  }

  /** Discord ids being counted right now. */
  activeIds() {
    return [...this.#active.keys()]
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
    const upsertDay = this.#db.prepare(`
      INSERT INTO daily_time (discord_id, day, ms) VALUES (?, ?, ?)
      ON CONFLICT (discord_id, day) DO UPDATE SET ms = ms + excluded.ms
      RETURNING ms, goal_reached_at
    `)
    const markDayGoal = this.#db.prepare('UPDATE daily_time SET goal_reached_at = ? WHERE discord_id = ? AND day = ?')
    const upsertSlot = this.#db.prepare(`
      INSERT INTO challenge_progress (discord_id, track, challenge_id, day_index, ms) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (discord_id, track, challenge_id, day_index) DO UPDATE SET ms = ms + excluded.ms
      RETURNING ms, goal_reached_at
    `)
    const markSlotGoal = this.#db.prepare(
      `UPDATE challenge_progress SET goal_reached_at = ?
       WHERE discord_id = ? AND track = ? AND challenge_id = ? AND day_index = ?`,
    )

    while (from < to) {
      const slot = this.#slotOf(discordId, from)
      // Never let a segment span a UTC midnight or a challenge day boundary.
      const segmentEnd = Math.min(to, (Math.floor(from / DAY_MS) + 1) * DAY_MS, slot?.endMs ?? Infinity)
      const day = utcDay(from)
      const dayRow = upsertDay.get(discordId, day, segmentEnd - from) as { ms: number; goal_reached_at: number | null }
      if (dayRow.ms >= this.goalMs && dayRow.goal_reached_at === null) {
        markDayGoal.run(segmentEnd, discordId, day)
      }

      if (slot) {
        const row = upsertSlot.get(discordId, slot.track, slot.challengeId, slot.dayIndex, segmentEnd - from) as {
          ms: number
          goal_reached_at: number | null
        }
        const goalMs = slot.startMs === undefined ? this.goalMs : this.goalMsFor(slot.startMs, slot.endMs)
        if (row.ms >= goalMs && row.goal_reached_at === null) {
          markSlotGoal.run(segmentEnd, discordId, slot.track, slot.challengeId, slot.dayIndex)
          console.log(
            `[tracker] ${discordId} passed day ${slot.dayIndex} of challenge #${slot.challengeId}`,
          )
        }
      }
      from = segmentEnd
    }
  }
}
