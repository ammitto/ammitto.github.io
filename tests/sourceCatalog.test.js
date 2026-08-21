/**
 * Which sources exist, and which of them are worth requesting.
 *
 * The defect these cover is guaranteed 404s on every browse visit: the
 * composable requested an aggregate for every source it listed, and some
 * publish none. The obvious repair — deleting those codes — would trade a
 * visible defect for an invisible one, because the same list is what the
 * browse page iterates to assemble results. So the assertions below pin
 * both halves: the catalogue stays complete, and only the served subset
 * is fetched.
 *
 * THE GROUND TRUTH IS THE THRESHOLD MANIFEST, NOT A LITERAL HERE.
 * An earlier version of this file carried its own copy of which sources
 * were served, checked by hand against the live API on 2026-08-13. On
 * 2026-08-19 `un_vessels` began publishing — the manifest moved it into
 * publishing_sources with a floor of 41 — and this suite stayed green,
 * because it was comparing one stale copy against another. Meanwhile the
 * browse page returned nothing for 59 published entities without so much
 * as a request. Reading `.github/harmonize-thresholds.json` is what makes
 * that drift fail here: it is the same file the deploy gates on, so a
 * source cannot change status without this test noticing.
 *
 * Plain JavaScript against the emitted modules, for the reason spelled out
 * at the top of normalizeNode.test.js.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  ALL_SOURCES,
  SOURCES_WITHOUT_AGGREGATE,
  fetchableSources,
  publishesAggregate,
} from '../.test-build/utils/sourceCatalog.js'

// Derived, not transcribed. publishing_sources are harmonized and
// published; pending_sources are the ones whose input is missing upstream
// and which the deploy holds at exactly zero entities.
const manifest = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '.github', 'harmonize-thresholds.json'),
    'utf8',
  ),
)
// publishing_sources is an array of codes; pending_sources is an object
// keyed by code, whose values are the reason each is held back.
const SERVED = manifest.publishing_sources
const NOT_SERVED = Object.keys(manifest.pending_sources)

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
  // As a SET. The manifest lists codes alphabetically while
  // fetchableSources follows catalogue order, which the order test below
  // pins separately.
  assert.deepEqual([...fetchableSources()].sort(), [...SERVED].sort())
})

test('the fetch list drops precisely the sources that 404', () => {
  const dropped = ALL_SOURCES.filter(s => !fetchableSources().includes(s))
  assert.deepEqual([...dropped].sort(), [...NOT_SERVED].sort())
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
  // from the second list and it is fetched, with no other edit. Held-back
  // codes come from the manifest so this cannot pin a stale example — it
  // named `un_vessels` while that source was already publishing.
  const [held, ...stillHeld] = NOT_SERVED
  const expected = ALL_SOURCES.filter((s) => !stillHeld.includes(s))
  assert.deepEqual(fetchableSources(ALL_SOURCES, stillHeld), expected)
  assert.ok(fetchableSources(ALL_SOURCES, stillHeld).includes(held))
})
