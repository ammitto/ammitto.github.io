/**
 * End-to-end recall through a REAL FlexSearch index.
 *
 * Every other test of the encoder inspects the token array in isolation. That
 * is why a blocker got through: `foldForSearch` was installed as FlexSearch's
 * `encode`, which runs on the QUERY as well as the document, and FlexSearch
 * INTERSECTS the query's terms. When the encoder still glued adjacent tokens,
 * a two-word query gained a glued term that existed in a document only if
 * those two words were adjacent, in that order — so the query became an
 * unsatisfiable AND. Measured over the live 61,099-row index at the time:
 *
 *     ali leilabadi   9 -> 0     (the listed person "Ali Hajinia Leilabadi")
 *     bank mine       4 -> 0     ("Bank of Industry and Mine")
 *     dedrone axon    1 -> 0     ("Dedrone by Axon")
 *
 * and a sweep of 1,313 two-word queries lost results on 426 and zeroed 340.
 * On a sanctions register that is a mass false negative — the exact failure
 * the surrounding work exists to remove.
 *
 * The token-level tests could not see it because the defect only appears once
 * a query is intersected against an index. So this file builds one.
 *
 * It runs against a small hand-written corpus rather than the committed
 * snapshot, so it is fast, deterministic, and does not change meaning when the
 * data is republished.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import FlexSearch from 'flexsearch'

import {
  foldForSearch,
  indexableText,
} from '../.test-build/utils/searchEncode.js'

/** Names chosen to exercise the particle, the company suffix and the accent. */
const CORPUS = [
  'Ali Hajinia Leilabadi',
  'Bank of Industry and Mine',
  'Dedrone by Axon',
  'Al-Qaida',
  'Usama bin Laden',
  'Islámský stát',
  'General Dynamics',
  'Kim Jong Un',
  'Elbit Systems LLC',
]

/** Mimics `searchRowText`: the name followed by its metadata, space-joined. */
const META = {
  'Ali Hajinia Leilabadi': 'IRAN',
  'Bank of Industry and Mine': 'IRAN',
  'Kim Jong Un': 'KOREA, DEMOCRATIC PEOPLE\'S REPUBLIC OF',
}
const rowTextFor = (name) => (META[name] ? `${name} ${META[name]}` : name)

function buildIndex() {
  const index = new FlexSearch.Index({
    tokenize: 'forward',
    cache: true,
    encode: foldForSearch,
  })
  // Indexed the way useSearchIndex does it: the full row text (name plus the
  // metadata searchRowText appends) as the document, but the glue drawn only
  // from the name. Passing the row text to both is what produced
  // `mohammadiran` and its prefix matches.
  CORPUS.forEach((name, i) => index.add(i, indexableText(rowTextFor(name), [name])))
  return index
}

const hits = (index, query) =>
  index.search(query, { limit: 100 }).map((i) => CORPUS[i])

test('a two-word query still matches the record it names', () => {
  const index = buildIndex()
  // Each of these returned ZERO while the encoder glued on the query side.
  assert.deepEqual(hits(index, 'ali leilabadi'), ['Ali Hajinia Leilabadi'])
  assert.deepEqual(hits(index, 'bank mine'), ['Bank of Industry and Mine'])
  assert.deepEqual(hits(index, 'dedrone axon'), ['Dedrone by Axon'])
  assert.deepEqual(hits(index, 'elbit llc'), ['Elbit Systems LLC'])
})

test('a short word in the query does not become an unsatisfiable term', () => {
  const index = buildIndex()
  // "kim" and "un" are both <= 4 chars, which is what made the old glue rule
  // fire on ordinary name words rather than only on particles.
  assert.deepEqual(hits(index, 'kim un'), ['Kim Jong Un'])
  assert.deepEqual(hits(index, 'kim jong un'), ['Kim Jong Un'])
})

test('the run-together spelling still reaches the hyphenated record', () => {
  const index = buildIndex()
  // The gain the glue exists for; it must survive moving to index time.
  assert.deepEqual(hits(index, 'alqaida'), ['Al-Qaida'])
  assert.deepEqual(hits(index, 'al qaida'), ['Al-Qaida'])
  assert.deepEqual(hits(index, 'binladen'), ['Usama bin Laden'])
  assert.deepEqual(hits(index, 'bin laden'), ['Usama bin Laden'])
})

test('an unaccented query reaches the accented record', () => {
  const index = buildIndex()
  assert.deepEqual(hits(index, 'islamsky'), ['Islámský stát'])
})

test('word order within a query does not matter', () => {
  const index = buildIndex()
  // An AND over plain terms is order-independent; a glued term was not.
  assert.deepEqual(hits(index, 'leilabadi ali'), ['Ali Hajinia Leilabadi'])
  assert.deepEqual(hits(index, 'mine bank'), ['Bank of Industry and Mine'])
})

test('a query naming two different records still matches neither wrongly', () => {
  const index = buildIndex()
  // Intersection must still narrow: these words never co-occur.
  assert.deepEqual(hits(index, 'dedrone laden'), [])
})

test('no glued token spans a name and its metadata', () => {
  const index = buildIndex()
  // "Kim Jong Un" from Korea must not yield `unkorea`, and "Bank of Industry
  // and Mine" from Iran must not yield `mineiran`. Under whole-row gluing these
  // existed, and `tokenize: 'forward'` then matched them by prefix — which is
  // how `mohammadi` returned 101 rows of which 55 carried no such name.
  assert.deepEqual(hits(index, 'unkorea'), [])
  assert.deepEqual(hits(index, 'mineiran'), [])
  assert.deepEqual(hits(index, 'leilabadiiran'), [])
  // The real names still resolve.
  assert.deepEqual(hits(index, 'kim jong un'), ['Kim Jong Un'])
  assert.deepEqual(hits(index, 'bank mine'), ['Bank of Industry and Mine'])
})
