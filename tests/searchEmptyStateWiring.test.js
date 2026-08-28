/**
 * The search page's empty state must not be reachable by a dangling `v-else`.
 *
 * The defect this pins, observed on the live site on 2026-08-28:
 * https://www.ammitto.org/search?q=mudacumura returned seven real results for
 * a man sanctioned by the UN, EU, UK, US, Japan, Australia and Switzerland,
 * rendered all seven, and then rendered "No results found — No entities match
 * your current search criteria" underneath them.
 *
 * The cause was one character. The block carried `v-else`, and Vue binds
 * `v-else` to the immediately preceding sibling — which was the "Load More"
 * block, not the results grid. So the empty state rendered whenever there was
 * nothing further to load, i.e. on every query whose results fit one page, and
 * also while the 20 MB index was still downloading.
 *
 * This is a wiring test: it reads the source text of the `.vue` file and
 * checks what is written, not what evaluates. That is the right instrument
 * here, because the failure was a template-binding relationship that no unit
 * test of a pure module could observe.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  new URL('../src/views/SearchPage.vue', import.meta.url),
  'utf8',
)

/**
 * The opening tag of the empty-state card.
 *
 * Anchored on the card's own class rather than on the nearest `<div` before
 * the "No match found" heading: the heading is preceded by the icon circle's
 * div, so walking back one tag finds a decorative wrapper and would let the
 * real guard change without failing anything.
 */
function emptyStateOpeningTag() {
  const at = source.indexOf('No match found')
  assert.notEqual(at, -1, 'expected the empty state to be headed "No match found"')

  const tags = source.slice(0, at).match(/<div\b[^>]*>/g) || []
  const card = [...tags].reverse().find((t) => t.includes('glass-card p-12'))

  assert.ok(
    card,
    'expected the "No match found" heading to sit inside a `glass-card p-12` card',
  )
  return card
}

test('the empty state is guarded by its own v-if, never a v-else', () => {
  const tag = emptyStateOpeningTag()

  assert.ok(
    !/\bv-else\b/.test(tag),
    'the empty state must not use v-else: it binds to the previous sibling ' +
      '(the Load More block), which is how it came to render underneath real results',
  )
  assert.ok(
    /\bv-if=/.test(tag),
    'the empty state must carry an explicit v-if',
  )
})

test('the empty state requires the result set to actually be empty', () => {
  const tag = emptyStateOpeningTag()
  assert.match(
    tag,
    /filteredEntities\.length === 0/,
    'the empty state must test the result count directly, not a proxy such ' +
      'as hasMoreResults',
  )
})

test('the empty state waits for loading to finish before asserting a negative', () => {
  const tag = emptyStateOpeningTag()
  assert.match(
    tag,
    /!loading/,
    'a half-loaded index must not produce "no match": on a sanctions register ' +
      'a premature negative is filed by the reader as a clear',
  )
})

test('the old copy, which stated a finding rather than a failure to match, is gone', () => {
  assert.ok(
    !source.includes('No entities match your current search criteria'),
    'this wording asserts a fact about the world; the empty state must instead ' +
      'name the scope (how many lists) and the date it is true as of',
  )
})

test('the empty state names its scope and its date', () => {
  // Without both, a negative result cannot be filed as a screening outcome.
  assert.match(
    source,
    /No entity on the \{\{ sourceCount \}\} lists Ammitto covers matches/,
    'the empty state must say how many lists were consulted, from the index ' +
      'metadata rather than a hand-written number',
  )
  assert.match(
    source,
    /Data as of \{\{ asOf \}\}/,
    'the empty state must carry the data date',
  )
})

test('near misses are offered, and only when the search has settled', () => {
  assert.match(source, /nearMisses/, 'expected a near-miss suggestion list')
  // Suggestions must not appear while loading, or against a non-empty result
  // set — both would be answering a question the page has not yet asked.
  const block = source.slice(source.indexOf('const nearMisses'))
  assert.match(block.slice(0, 400), /if \(loading\.value/)
  assert.match(block.slice(0, 400), /filteredEntities\.value\.length > 0/)
})

test('the "with the current filters" clause is keyed to facets, not to the query', () => {
  // `hasActiveFilters` counts `searchQuery` itself, so using it here would tell
  // a reader searching a bare name that filters were also narrowing the result.
  assert.match(
    source,
    /v-if="hasFacetFilters"> with the current filters/,
    'the clause must be conditional on hasFacetFilters',
  )
  assert.match(
    source,
    /const hasFacetFilters = computed/,
    'hasFacetFilters must exist and exclude searchQuery',
  )
})
