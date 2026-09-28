/**
 * Pages build display objects only for what they show.
 *
 * /search used to turn every match into a card (27,005 for "a") while the grid
 * showed 50, /browse/entities indexed every loaded entity even though no search
 * ran, and each badge recomputed its colours from the seed. Each of those cost
 * a visible stall on the live data. See "Rendering large lists" in README.adoc.
 *
 * The slice and index checks are wiring tests: they read the source text,
 * because the regression would be a computed that maps too much, which no
 * unit test of a pure module can observe. The colour check runs the module.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pillToneVars } from '../.test-build/config/palette.js'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

/**
 * The source of a top-level declaration, up to the next top-level one. Fails
 * when either end is missing, so a renamed or reshaped declaration cannot
 * leave an assertion checking an empty or truncated slice.
 */
function declaration(source, opener) {
  const start = source.indexOf(opener)
  assert.notEqual(start, -1, `expected ${opener}`)
  const next = source.slice(start + 1).search(/\n(?:const|let|function|async function|export) /)
  assert.notEqual(next, -1, `expected a declaration after ${opener}`)
  return source.slice(start, start + 1 + next)
}

test('filteredEntities holds rows; only paginatedEntities builds cards', () => {
  const page = read('../src/views/SearchPage.vue')
  const filtered = declaration(page, 'const filteredEntities = computed(')
  assert.doesNotMatch(filtered, /entityAdapter|searchRowToCard|\.map\(/)
  assert.match(filtered, /return filter\(results, filterSelection\.value\)/)
  const paginated = declaration(page, 'const paginatedEntities = computed(')
  assert.match(paginated, /filteredEntities\.value\.slice\(0, loadedCount\.value\)\.map\(/)
  assert.match(paginated, /finalCards\.get\(/)
})

test('loading a source queues it; the first search indexes the queue', () => {
  const data = read('../src/composables/useSanctionsData.ts')
  const load = declaration(data, 'async function loadSourceEntities(')
  assert.doesNotMatch(load, /indexEntities\(/)
  assert.match(load, /unindexedEntities\.push\(\.\.\.entities\)/)
  const search = declaration(data, 'function searchEntities(')
  assert.match(search, /indexEntities\(unindexedEntities\)/)
  assert.match(search, /unindexedEntities = \[\]/)
  // The composable is not in the test build (it pulls in Vue and FlexSearch),
  // so the order is checked in the source: the queue is indexed before the
  // index is searched.
  const drain = search.indexOf('indexEntities(unindexedEntities)')
  const query = search.indexOf('searchIndex.search(')
  assert.notEqual(query, -1, 'expected searchIndex.search( in searchEntities')
  assert.ok(drain < query, 'the queue must be indexed before searchIndex.search')
})

test('pillToneVars returns one shared, frozen object per seed', () => {
  const a = pillToneVars('#1d4ed8')
  assert.equal(pillToneVars('#1d4ed8'), a)
  assert.ok(Object.isFrozen(a))
  assert.notEqual(pillToneVars('#dc2626'), a)
  assert.equal(pillToneVars(undefined), pillToneVars(null))
})
