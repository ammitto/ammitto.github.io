import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sourceFreshness } from '../scripts/generate-source-freshness.js'

const commit = 'a'.repeat(40)
const committedAt = '2026-10-12T15:21:15Z'
const builtAt = '2026-10-15T13:00:00Z'
const notice = date => ({ '@type': 'OfficialAnnouncement', publishDate: date })
const generate = graph => sourceFreshness(graph, commit, committedAt, builtAt)

test('coverage uses latest included announcement, preserving unknown import/check dates', () => {
  const result = generate({ '@graph': [notice('2025-10-09'), { announcement: notice('2026-02-24') }, notice('2025-10-09')] }).cn
  assert.equal(result.latestIncludedAnnouncementDate, '2026-02-24')
  assert.equal(result.sourceSnapshotCommit, commit)
  assert.equal(result.sourceSnapshotCommittedAt, committedAt)
  assert.equal(result.snapshotBuiltAt, builtAt)
  assert.equal(result.lastManualImportAt, null)
  assert.equal(result.lastOfficialSourceCheckAt, null)
})

test('unrelated dates do not become announcement coverage dates', () => {
  const result = generate({ '@graph': [notice('2025-10-09'), { '@type': 'SanctionEntry', publishDate: '2099-01-01' }] })
  assert.equal(result.cn.latestIncludedAnnouncementDate, '2025-10-09')
})

test('missing graph, missing dates, impossible dates and invalid commit fail publication', () => {
  for (const value of [{}, { '@graph': [] }, { '@graph': [notice('2026-02-30')] }, { '@graph': [notice('not a date')] }]) {
    assert.throws(() => generate(value))
  }
  assert.throws(() => sourceFreshness({ '@graph': [notice('2026-02-24')] }, 'main', committedAt, builtAt))
})
