import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GrindTracker, utcWeekStart } from '../src/tracker.ts'

const H = 60 * 60 * 1000
const at = (iso: string) => Date.parse(iso)

test('accumulates separate sessions within a day', () => {
  const t = new GrindTracker(':memory:', 3 * 60 * 60)
  t.start('u', at('2026-09-21T01:00:00Z'))
  t.stop('u', at('2026-09-21T02:30:00Z'))
  t.start('u', at('2026-09-21T10:00:00Z'))
  t.stop('u', at('2026-09-21T11:30:00Z'))
  const monday = t.week('u', at('2026-09-21T12:00:00Z'))[0]
  assert.equal(monday.day, '2026-09-21')
  assert.equal(monday.seconds, 3 * 60 * 60)
  assert.equal(monday.goalMet, true)
})

test('splits a session at UTC midnight', () => {
  const t = new GrindTracker(':memory:', 3 * 60 * 60)
  t.start('u', at('2026-09-21T23:00:00Z'))
  t.stop('u', at('2026-09-22T01:00:00Z'))
  const [mon, tue] = t.week('u', at('2026-09-22T02:00:00Z'))
  assert.equal(mon.seconds, 60 * 60)
  assert.equal(tue.seconds, 60 * 60)
  assert.equal(mon.goalMet, false)
})

test('flush does not double count', () => {
  const t = new GrindTracker(':memory:', 3 * 60 * 60)
  const start = at('2026-09-23T08:00:00Z')
  t.start('u', start)
  t.flush(start + 1 * H)
  t.flush(start + 2 * H)
  t.stop('u', start + 3 * H)
  assert.equal(t.week('u', start + 4 * H)[2].seconds, 3 * 60 * 60)
})

test('stop without start and repeated start are no-ops', () => {
  const t = new GrindTracker(':memory:', 60)
  t.stop('u', at('2026-09-21T00:00:00Z'))
  t.start('u', at('2026-09-21T00:00:00Z'))
  t.start('u', at('2026-09-21T00:30:00Z')) // still counting from 00:00
  t.stop('u', at('2026-09-21T01:00:00Z'))
  assert.equal(t.week('u', at('2026-09-21T02:00:00Z'))[0].seconds, 60 * 60)
})

test('week includes unflushed time for today and runs Monday to Sunday', () => {
  const t = new GrindTracker(':memory:', 3 * 60 * 60)
  t.start('u', at('2026-09-27T20:00:00Z')) // Sunday
  const days = t.week('u', at('2026-09-27T21:00:00Z'))
  assert.equal(days.length, 7)
  assert.equal(days[0].day, '2026-09-21')
  assert.equal(days[6].day, '2026-09-27')
  assert.equal(days[6].seconds, 60 * 60)
  assert.equal(utcWeekStart(at('2026-09-21T00:00:00Z')), at('2026-09-21T00:00:00Z'))
})

test('users are tracked independently', () => {
  const t = new GrindTracker(':memory:', 60)
  t.start('a', at('2026-09-21T00:00:00Z'))
  t.start('b', at('2026-09-21T00:30:00Z'))
  t.stopAll(at('2026-09-21T01:00:00Z'))
  assert.equal(t.week('a', at('2026-09-21T02:00:00Z'))[0].seconds, 60 * 60)
  assert.equal(t.week('b', at('2026-09-21T02:00:00Z'))[0].seconds, 30 * 60)
})

test('splits time at challenge day boundaries and reports per-day progress', () => {
  const t = new GrindTracker(':memory:', 60) // 1 minute goal
  const start = at('2026-09-21T00:00:00Z')
  const dayMs = 10 * 60 * 1000 // 10-minute days, like the test track
  t.setSlotResolver((_id, ms) => {
    const dayIndex = Math.floor((ms - start) / dayMs)
    if (dayIndex < 0 || dayIndex > 5) return null
    return { track: 2, challengeId: 100, dayIndex, endMs: start + (dayIndex + 1) * dayMs }
  })

  t.start('u', start + 9 * 60 * 1000) // 1 minute before day 0 ends
  t.stop('u', start + 12 * 60 * 1000) // 2 minutes into day 1

  const days = t.challenge('u', 2, 100, 6)
  assert.equal(days[0].seconds, 60)
  assert.equal(days[1].seconds, 120)
  assert.equal(days[0].goalMet, true)
  assert.equal(days[2].seconds, 0)
  assert.equal(days[2].goalMet, false)
})

test('records are pending until marked, and time outside a challenge is not bucketed', () => {
  const t = new GrindTracker(':memory:', 60)
  const start = at('2026-09-21T00:00:00Z')
  t.setSlotResolver((_id, ms) =>
    ms < start ? null : { track: 2, challengeId: 100, dayIndex: 0, endMs: start + 600_000 },
  )

  t.start('u', start - 300_000) // before the challenge: counted for the day, not for the challenge
  t.stop('u', start - 60_000)
  assert.deepEqual(t.pendingRecords(), [])

  t.start('u', start)
  t.stop('u', start + 120_000)
  assert.deepEqual(t.pendingRecords(), [{ discordId: 'u', track: 2, challengeId: 100, dayIndex: 0 }])

  t.markRecorded({ discordId: 'u', track: 2, challengeId: 100, dayIndex: 0 })
  assert.deepEqual(t.pendingRecords(), [])
  assert.equal(t.challenge('u', 2, 100, 6)[0].recorded, true)
})
