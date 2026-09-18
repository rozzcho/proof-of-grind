import { DatabaseSync } from 'node:sqlite'

/** A juror has this long to answer before someone else is asked. */
export const JUROR_TIMEOUT_MS = 10 * 60_000
/** The reporter can take a report back for this long. */
export const CANCEL_WINDOW_MS = 10 * 60_000
/** Jurors needed; a majority of them decides. */
export const JURY_SIZE = 3
const MAJORITY = Math.floor(JURY_SIZE / 2) + 1

export type ReportStatus = 'pending' | 'upheld' | 'dismissed' | 'void' | 'cancelled'
export type Vote = 'uphold' | 'dismiss'

export type Report = {
  id: number
  track: number
  challengeId: number
  voiceChannelId: string
  reporterId: string
  targetId: string
  reason: string | null
  status: ReportStatus
  createdAt: number
  closedAt: number | null
  /** For an upheld report: whether the warning is on chain yet. */
  warned: boolean
}

export type Juror = {
  reportId: number
  jurorId: string
  askedAt: number
  vote: Vote | null
  answeredAt: number | null
  /** Did not answer in time, or could not be messaged. */
  expired: boolean
  dmChannelId: string | null
  dmMessageId: string | null
}

type ReportRow = {
  id: number
  track: number
  challenge_id: number
  voice_channel_id: string
  reporter_id: string
  target_id: string
  reason: string | null
  status: ReportStatus
  created_at: number
  closed_at: number | null
  warned: number
}

type JurorRow = {
  report_id: number
  juror_id: string
  asked_at: number
  vote: Vote | null
  answered_at: number | null
  expired: number
  dm_channel_id: string | null
  dm_message_id: string | null
}

const toReport = (r: ReportRow): Report => ({
  id: r.id,
  track: r.track,
  challengeId: r.challenge_id,
  voiceChannelId: r.voice_channel_id,
  reporterId: r.reporter_id,
  targetId: r.target_id,
  reason: r.reason,
  status: r.status,
  createdAt: r.created_at,
  closedAt: r.closed_at,
  warned: r.warned === 1,
})

const toJuror = (j: JurorRow): Juror => ({
  reportId: j.report_id,
  jurorId: j.juror_id,
  askedAt: j.asked_at,
  vote: j.vote,
  answeredAt: j.answered_at,
  expired: j.expired === 1,
  dmChannelId: j.dm_channel_id,
  dmMessageId: j.dm_message_id,
})

/** What the jury has said so far. */
export function tallyVotes(jurors: Juror[]) {
  const upheld = jurors.filter((j) => j.vote === 'uphold').length
  const dismissed = jurors.filter((j) => j.vote === 'dismiss').length
  const waiting = jurors.filter((j) => j.vote === null && !j.expired).length
  // Decided as soon as a majority agrees; nobody waits for the last juror.
  const outcome: 'upheld' | 'dismissed' | null = upheld >= MAJORITY ? 'upheld' : dismissed >= MAJORITY ? 'dismissed' : null
  // Seats still to fill: answered and waiting jurors count toward the jury.
  const seatsOpen = outcome ? 0 : Math.max(0, JURY_SIZE - (upheld + dismissed + waiting))
  return { upheld, dismissed, waiting, outcome, seatsOpen }
}

/**
 * Reports and their juries, kept in SQLite so a restart does not lose a report in progress
 * or its 10-minute timers.
 */
export class ReportStore {
  #db: DatabaseSync

  constructor(path: string) {
    this.#db = new DatabaseSync(path)
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        track INTEGER NOT NULL,
        challenge_id INTEGER NOT NULL,
        voice_channel_id TEXT NOT NULL,
        reporter_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        reason TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        closed_at INTEGER,
        warned INTEGER NOT NULL DEFAULT 0
      )
    `)
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS report_jurors (
        report_id INTEGER NOT NULL,
        juror_id TEXT NOT NULL,
        asked_at INTEGER NOT NULL,
        vote TEXT,
        answered_at INTEGER,
        expired INTEGER NOT NULL DEFAULT 0,
        dm_channel_id TEXT,
        dm_message_id TEXT,
        PRIMARY KEY (report_id, juror_id)
      )
    `)
  }

  create(input: Omit<Report, 'id' | 'status' | 'closedAt' | 'warned' | 'createdAt'>, now = Date.now()) {
    const { lastInsertRowid } = this.#db
      .prepare(
        `INSERT INTO reports (track, challenge_id, voice_channel_id, reporter_id, target_id, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(input.track, input.challengeId, input.voiceChannelId, input.reporterId, input.targetId, input.reason, now)
    return this.get(Number(lastInsertRowid))!
  }

  get(id: number) {
    const row = this.#db.prepare('SELECT * FROM reports WHERE id = ?').get(id) as ReportRow | undefined
    return row ? toReport(row) : null
  }

  /** The open report against someone, if any: one at a time per person. */
  pendingAgainst(targetId: string) {
    const row = this.#db
      .prepare(`SELECT * FROM reports WHERE target_id = ? AND status = 'pending' LIMIT 1`)
      .get(targetId) as ReportRow | undefined
    return row ? toReport(row) : null
  }

  pending() {
    return (this.#db.prepare(`SELECT * FROM reports WHERE status = 'pending'`).all() as ReportRow[]).map(toReport)
  }

  /** Upheld reports whose warning did not reach the chain yet (retried until it does). */
  unwarned() {
    return (
      this.#db.prepare(`SELECT * FROM reports WHERE status = 'upheld' AND warned = 0`).all() as ReportRow[]
    ).map(toReport)
  }

  /** The newest reports, whatever their status. */
  recent(limit = 20) {
    return (
      this.#db.prepare('SELECT * FROM reports ORDER BY id DESC LIMIT ?').all(limit) as ReportRow[]
    ).map(toReport)
  }

  close(id: number, status: Exclude<ReportStatus, 'pending'>, now = Date.now()) {
    this.#db
      .prepare(`UPDATE reports SET status = ?, closed_at = ? WHERE id = ? AND status = 'pending'`)
      .run(status, now, id)
  }

  markWarned(id: number) {
    this.#db.prepare('UPDATE reports SET warned = 1 WHERE id = ?').run(id)
  }

  /** The reporter takes it back: only their own, only while pending and within the cancel window. */
  cancel(id: number, userId: string, now = Date.now()) {
    const report = this.get(id)
    if (!report || report.reporterId !== userId) return { ok: false as const, reason: 'not-yours' }
    if (report.status !== 'pending') return { ok: false as const, reason: 'closed' }
    if (now - report.createdAt > CANCEL_WINDOW_MS) return { ok: false as const, reason: 'too-late' }
    this.close(id, 'cancelled', now)
    return { ok: true as const, report }
  }

  jurors(reportId: number) {
    return (
      this.#db.prepare('SELECT * FROM report_jurors WHERE report_id = ?').all(reportId) as JurorRow[]
    ).map(toJuror)
  }

  addJuror(reportId: number, jurorId: string, now = Date.now()) {
    this.#db
      .prepare('INSERT OR IGNORE INTO report_jurors (report_id, juror_id, asked_at) VALUES (?, ?, ?)')
      .run(reportId, jurorId, now)
  }

  setJurorMessage(reportId: number, jurorId: string, dmChannelId: string, dmMessageId: string) {
    this.#db
      .prepare('UPDATE report_jurors SET dm_channel_id = ?, dm_message_id = ? WHERE report_id = ? AND juror_id = ?')
      .run(dmChannelId, dmMessageId, reportId, jurorId)
  }

  /** A juror who could not be reached, or did not answer in time, no longer holds a seat. */
  expireJuror(reportId: number, jurorId: string) {
    this.#db
      .prepare('UPDATE report_jurors SET expired = 1 WHERE report_id = ? AND juror_id = ? AND vote IS NULL')
      .run(reportId, jurorId)
  }

  /** Jurors past the timeout without a vote, across all pending reports. */
  expireStale(now = Date.now()) {
    const stale = this.#db
      .prepare(
        `SELECT j.* FROM report_jurors j JOIN reports r ON r.id = j.report_id
         WHERE r.status = 'pending' AND j.vote IS NULL AND j.expired = 0 AND j.asked_at <= ?`,
      )
      .all(now - JUROR_TIMEOUT_MS) as JurorRow[]
    for (const juror of stale) this.expireJuror(juror.report_id, juror.juror_id)
    return stale.map(toJuror)
  }

  /** Records a vote. Only an asked juror of a pending report, once, before their time runs out. */
  vote(reportId: number, jurorId: string, vote: Vote, now = Date.now()) {
    const report = this.get(reportId)
    if (!report || report.status !== 'pending') return { ok: false as const, reason: 'closed' }
    const juror = this.jurors(reportId).find((j) => j.jurorId === jurorId)
    if (!juror) return { ok: false as const, reason: 'not-a-juror' }
    if (juror.vote !== null) return { ok: false as const, reason: 'already-voted' }
    if (juror.expired || now - juror.askedAt > JUROR_TIMEOUT_MS) return { ok: false as const, reason: 'too-late' }
    this.#db
      .prepare('UPDATE report_jurors SET vote = ?, answered_at = ? WHERE report_id = ? AND juror_id = ?')
      .run(vote, now, reportId, jurorId)
    return { ok: true as const }
  }
}
