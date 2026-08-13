/**
 * Which sources exist, and which of them are worth requesting.
 *
 * The defect these cover is two guaranteed 404s on every browse visit:
 * the composable requested an aggregate for every source it listed, and
 * two of them publish none. The obvious repair — deleting those codes —
 * would trade a visible defect for an invisible one, because the same
 * list is what the browse page iterates to assemble results. So the
 * assertions below pin both halves: the catalogue stays complete, and
 * only the served subset is fetched.
 *
 * Plain JavaScript against the emitted modules, for the reason spelled out
 * at the top of normalizeNode.test.js.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ALL_SOURCES,
  SOURCES_WITHOUT_AGGREGATE,
  fetchableSources,
  publishesAggregate,
} from '../.test-build/utils/sourceCatalog.js'

/**
 * LIVE — every code under https://ammitto.org/api/v1/sources/, checked
 * 2026-08-13. `ru` and `un_vessels` answer 404; the other thirteen answer
 * 200. The producer's own stats.json lists exactly those thirteen.
 */
const SERVED = [
  'eu', 'un', 'us', 'wb', 'uk', 'au', 'ca', 'ch', 'cn', 'tr', 'nz', 'jp', 'eu_vessels',
]
const NOT_SERVED = ['ru', 'un_vessels']

test('the catalogue still names every source, served or not', () => {
  // The point of the fix. A source that stops 404-ing because it was
  // deleted has not been fixed, it has been hidden — and it would stay
  // hidden after it starts publishing.
  for (const source of [...SERVED, ...NOT_SERVED]) {
    assert.ok(
      ALL_SOURCES.includes(source),
      `${source} must stay in ALL_SOURCES; it is the browse page's iteration order`,
    )
  }
  assert.equal(ALL_SOURCES.length, SERVED.length + NOT_SERVED.length)
})

test('the unserved sources are the ones that 404', () => {
  assert.deepEqual([...SOURCES_WITHOUT_AGGREGATE].sort(), [...NOT_SERVED].sort())
})

test('every unserved source is still a known source', () => {
  // A typo here would silence nothing and 404 forever, which is the
  // failure mode hardest to notice from the outside.
  for (const source of SOURCES_WITHOUT_AGGREGATE) {
    assert.ok(
      ALL_SOURCES.includes(source),
      `${source} is held back from fetching but is not a known source`,
    )
  }
})

test('the fetch list is exactly the sources that answer', () => {
  assert.deepEqual(fetchableSources(), SERVED)
})

test('the fetch list drops precisely the two that 404', () => {
  const dropped = ALL_SOURCES.filter(s => !fetchableSources().includes(s))
  assert.deepEqual(dropped, NOT_SERVED)
})

test('a source that publishes nothing is not requested', () => {
  for (const source of NOT_SERVED) {
    assert.equal(publishesAggregate(source), false, `${source} must not be requested`)
  }
})

test('a source that publishes is requested', () => {
  for (const source of SERVED) {
    assert.equal(publishesAggregate(source), true, `${source} must be requested`)
  }
})

test('an unknown code is requested rather than silently dropped', () => {
  // A code absent from the catalogue is the caller's mistake. Answering
  // "not published" would turn a typo into an empty result set with no
  // failed request to explain it.
  assert.equal(publishesAggregate('not_a_source'), true)
})

test('the fetch list keeps catalogue order', () => {
  const positions = fetchableSources().map(s => ALL_SOURCES.indexOf(s))
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b))
})

test('the fetch list is a copy, not the catalogue itself', () => {
  // A caller that sorted or spliced the result would otherwise narrow the
  // shared catalogue for every later reader.
  const first = fetchableSources()
  first.length = 0
  assert.equal(fetchableSources().length, SERVED.length)
  assert.equal(ALL_SOURCES.length, SERVED.length + NOT_SERVED.length)
})

test('publishing a held-back source needs only its removal from the set', () => {
  // The contract the comment in sourceCatalog.ts promises: drop a code
  // from the second list and it is fetched, with no other edit.
  assert.deepEqual(fetchableSources(ALL_SOURCES, ['un_vessels']), [...SERVED, 'ru'].sort(
    (a, b) => ALL_SOURCES.indexOf(a) - ALL_SOURCES.indexOf(b),
  ))
})
