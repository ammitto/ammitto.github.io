/**
 * Matches shown while the search index is still building.
 *
 * Two promises the search page makes about its partial results, pinned here
 * against a REAL FlexSearch index built the way useSearchIndex builds it:
 *
 * - A partial result never includes an entity the finished search would not
 *   return. On a sanctions register a wrong name on screen is as bad as a
 *   missing one, and PR #50 existed to remove exactly that mid-load failure.
 * - Cards already shown never move or disappear while loading; new matches
 *   are appended.
 *
 * The corpus is synthetic and small so the test is fast and does not change
 * meaning when the published data does.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import FlexSearch from 'flexsearch'

import {
  appendNewMatches,
  partialMatchIds,
} from '../.test-build/utils/progressiveResults.js'
import {
  foldForSearch,
  indexableText,
} from '../.test-build/utils/searchEncode.js'
import { searchRowText } from '../.test-build/utils/birthAdapters.js'

const LIMIT = 100000

function newIndex() {
  return new FlexSearch.Index({ tokenize: 'forward', cache: true, encode: foldForSearch })
}

/** The composable's per-row add, verbatim in effect. */
function addRow(index, entity) {
  index.add(
    entity.id,
    indexableText(
      searchRowText(entity),
      entity.primaryName ? [entity.primaryName, ...entity.names] : entity.names,
    ),
  )
}

/** Ids that occur on more than one row, as useSearchIndex computes them. */
function repeatedIdsOf(rows) {
  const seen = new Set()
  const repeated = new Set()
  for (const r of rows) (seen.has(r.id) ? repeated : seen).add(r.id)
  return repeated
}

const row = (id, name, extra = {}) => ({ id, ref: id, type: 'person', names: [name], ...extra })

/**
 * 600 rows: filler, plus names that match the probe queries at the start,
 * middle and end, some of them with the query as a later word so relevance
 * order over the finished index differs from discovery order.
 */
function corpus() {
  const rows = []
  for (let i = 0; i < 600; i++) {
    rows.push(row(`e${i}`, `Filler Person ${i}`, { country: i % 3 ? 'IRAN' : 'SYRIA' }))
  }
  rows[3] = row('e3', 'Acme Trading Zebulon Holdings')
  rows[250] = row('e250', 'Zebulon Kazan')
  rows[251] = row('e251', 'Mudacumura Sylvestre')
  rows[400] = row('e400', 'Sylvestre Mudacumura', { country: 'RWANDA' })
  rows[599] = row('e599', 'Zebulon')
  return rows
}

/**
 * Build the index row by row and, after every `every` rows, record the
 * partial matches for each query. Returns the recordings and the final index.
 */
function buildRecording(rows, queries, every, withheld) {
  const index = newIndex()
  const steps = []
  rows.forEach((r, i) => {
    addRow(index, r)
    if ((i + 1) % every === 0 || i === rows.length - 1) {
      const snap = {}
      for (const q of queries) snap[q] = partialMatchIds(index, q, withheld, LIMIT)
      steps.push(snap)
    }
  })
  return { steps, index }
}

const QUERIES = ['zebulon', 'mudacumura', 'sylvestre', 'filler 12', 'iran', 'zz-nothing']

test('every partial match, at every step of the build, is a final match', () => {
  const rows = corpus()
  const { steps, index } = buildRecording(rows, QUERIES, 7, repeatedIdsOf(rows))
  for (const q of QUERIES) {
    const final = new Set(index.search(q, { limit: LIMIT }).map(String))
    for (const [n, snap] of steps.entries()) {
      for (const id of snap[q]) {
        assert.ok(final.has(id), `step ${n}: "${q}" partially matched ${id}, which the finished index does not`)
      }
    }
  }
  // Not vacuous: the partial answers did find things before the end.
  assert.deepEqual(steps[1].zebulon, ['e3'])
})

test('a repeated id is withheld from partial results, because its later row replaces its text', () => {
  // `Index.add` with an id the index already holds REPLACES that document. So
  // "Zebulon Early" matches `zebulon` until the same id's second row lands,
  // after which it does not. Shown mid-load, it would be a name the finished
  // search disowns.
  const rows = [
    row('dup', 'Zebulon Early'),
    ...Array.from({ length: 20 }, (_, i) => row(`f${i}`, `Filler ${i}`)),
    row('dup', 'Someone Else Entirely'),
    row('z2', 'Zebulon Late'),
  ]
  const { index } = buildRecording(rows, [], rows.length, new Set())
  assert.deepEqual(index.search('zebulon', { limit: LIMIT }).map(String), ['z2'])

  const withheld = repeatedIdsOf(rows)
  assert.deepEqual([...withheld], ['dup'])
  const partial = newIndex()
  for (const [i, r] of rows.entries()) {
    addRow(partial, r)
    const ids = partialMatchIds(partial, 'zebulon', withheld, LIMIT)
    assert.ok(!ids.includes('dup'), `after row ${i}: withheld id shown as a partial match`)
  }

  // And without withholding it WOULD have been shown: the guard is load-bearing.
  const unguarded = newIndex()
  addRow(unguarded, rows[0])
  assert.deepEqual(partialMatchIds(unguarded, 'zebulon', new Set(), LIMIT), ['dup'])
})

test('appending partial matches never moves or drops a card, and ends with every final match', () => {
  const rows = corpus()
  const { steps, index } = buildRecording(rows, QUERIES, 5, repeatedIdsOf(rows))
  for (const q of QUERIES) {
    let shown = []
    for (const snap of steps) {
      const next = appendNewMatches(shown, snap[q])
      assert.deepEqual(next.slice(0, shown.length), shown, `"${q}": an already-shown card moved or vanished`)
      assert.equal(new Set(next).size, next.length, `"${q}": a card is shown twice`)
      shown = next
    }
    const final = index.search(q, { limit: LIMIT }).map(String)
    assert.deepEqual([...shown].sort(), [...final].sort(), `"${q}": partial list ends with a different set`)
  }
})

test('discovery order can differ from final relevance order, which is why the list appends', () => {
  // `e3` ("Acme Trading Zebulon Holdings") is found first; the finished index
  // ranks the later exact names ahead of it. Re-sorting mid-load would move it.
  const rows = corpus()
  const { steps, index } = buildRecording(rows, ['zebulon'], 5, repeatedIdsOf(rows))
  let shown = []
  for (const snap of steps) shown = appendNewMatches(shown, snap.zebulon)
  const final = index.search('zebulon', { limit: LIMIT }).map(String)
  assert.deepEqual(shown, ['e3', 'e250', 'e599'])
  assert.notDeepEqual(final, shown)
})

test('appendNewMatches keeps order, skips duplicates and returns the same list when nothing is new', () => {
  const shown = ['a', 'b']
  assert.deepEqual(appendNewMatches(shown, ['c', 'a', 'd', 'c']), ['a', 'b', 'c', 'd'])
  assert.equal(appendNewMatches(shown, ['b', 'a']), shown)
  assert.equal(appendNewMatches(shown, []), shown)
  assert.deepEqual(appendNewMatches([], ['x']), ['x'])
  assert.deepEqual(shown, ['a', 'b'], 'the input list is not mutated')
})

test('appendNewMatches with a caller-held seen set gives the same list and keeps the set in step', () => {
  const rows = corpus()
  const { steps } = buildRecording(rows, QUERIES, 5, repeatedIdsOf(rows))
  for (const q of QUERIES) {
    let plain = []
    let held = []
    const seen = new Set()
    for (const snap of steps) {
      plain = appendNewMatches(plain, snap[q])
      held = appendNewMatches(held, snap[q], seen)
      assert.deepEqual(held, plain, `"${q}": a held seen set changed the list`)
      assert.deepEqual([...seen].sort(), [...held].sort(), `"${q}": seen drifted from the list`)
    }
  }
  const shown = ['a']
  const seen = new Set(shown)
  assert.equal(appendNewMatches(shown, ['a'], seen), shown, 'nothing new: the same list')
})

test('partialMatchIds answers nothing for a blank query and returns string ids', () => {
  const index = newIndex()
  addRow(index, row('e1', 'Zebulon'))
  assert.deepEqual(partialMatchIds(index, '   ', new Set(), LIMIT), [])
  const numeric = { search: () => [1, 2] }
  assert.deepEqual(partialMatchIds(numeric, 'q', new Set(['2']), LIMIT), ['1'])
})
