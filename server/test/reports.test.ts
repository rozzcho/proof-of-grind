import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CANCEL_WINDOW_MS, JUROR_TIMEOUT_MS, ReportStore, tallyVotes } from '../src/reports.ts'

const T0 = Date.parse('2026-09-22T10:00:00Z')

function newReport(store = new ReportStore(':memory:')) {
  const report = store.create(
    { track: 0, challengeId: 0, voiceChannelId: 'room', reporterId: 'reporter', targetId: 'target', reason: 'empty desk' },
    T0,
  )
  return { store, report }
}

test('two matching votes decide without waiting for the third', () => {
  const { store, report } = newReport()
  for (const id of ['a', 'b', 'c']) store.addJuror(report.id, id, T0)
  store.vote(report.id, 'a', 'uphold', T0 + 1000)
  assert.equal(tallyVotes(store.jurors(report.id)).outcome, null)
  store.vote(report.id, 'b', 'uphold', T0 + 2000)
  assert.equal(tallyVotes(store.jurors(report.id)).outcome, 'upheld')

  const split = newReport()
  for (const id of ['a', 'b', 'c']) split.store.addJuror(split.report.id, id, T0)
  split.store.vote(split.report.id, 'a', 'uphold', T0)
  split.store.vote(split.report.id, 'b', 'dismiss', T0)
  assert.equal(tallyVotes(split.store.jurors(split.report.id)).outcome, null)
  split.store.vote(split.report.id, 'c', 'dismiss', T0)
  assert.equal(tallyVotes(split.store.jurors(split.report.id)).outcome, 'dismissed')
})

test('a juror who does not answer in 10 minutes gives up their seat', () => {
  const { store, report } = newReport()
  for (const id of ['a', 'b', 'c']) store.addJuror(report.id, id, T0)
  store.vote(report.id, 'a', 'uphold', T0 + 60_000)
  assert.equal(tallyVotes(store.jurors(report.id)).seatsOpen, 0)

  assert.deepEqual(store.expireStale(T0 + JUROR_TIMEOUT_MS - 1), [])
  const expired = store.expireStale(T0 + JUROR_TIMEOUT_MS)
  assert.deepEqual(expired.map((j) => j.jurorId).sort(), ['b', 'c'])
  assert.equal(tallyVotes(store.jurors(report.id)).seatsOpen, 2)

  // Too late to vote now.
  assert.equal(store.vote(report.id, 'b', 'uphold', T0 + JUROR_TIMEOUT_MS + 1).ok, false)
})

test('a juror votes once, and only on an open report they were asked about', () => {
  const { store, report } = newReport()
  store.addJuror(report.id, 'a', T0)
  assert.equal(store.vote(report.id, 'stranger', 'uphold', T0).ok, false)
  assert.equal(store.vote(report.id, 'a', 'uphold', T0).ok, true)
  assert.equal(store.vote(report.id, 'a', 'dismiss', T0).ok, false)

  store.close(report.id, 'void', T0)
  store.addJuror(report.id, 'b', T0)
  assert.equal(store.vote(report.id, 'b', 'uphold', T0).ok, false)
})

test('only the reporter can cancel, within 10 minutes', () => {
  const { store, report } = newReport()
  assert.equal(store.cancel(report.id, 'target', T0).ok, false)
  assert.equal(store.cancel(report.id, 'reporter', T0 + CANCEL_WINDOW_MS + 1).ok, false)
  assert.equal(store.cancel(report.id, 'reporter', T0 + CANCEL_WINDOW_MS).ok, true)
  assert.equal(store.get(report.id)!.status, 'cancelled')
  assert.equal(store.pendingAgainst('target'), null)
})

test('one open report per person; upheld reports wait for their warning', () => {
  const { store, report } = newReport()
  assert.equal(store.pendingAgainst('target')?.id, report.id)
  store.close(report.id, 'upheld', T0)
  assert.equal(store.pendingAgainst('target'), null)
  assert.deepEqual(store.unwarned().map((r) => r.id), [report.id])
  store.markWarned(report.id)
  assert.deepEqual(store.unwarned(), [])
})
