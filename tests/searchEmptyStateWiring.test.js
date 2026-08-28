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

test('the empty state also waits for the index to exist at all', () => {
  // Distinct from !loading, and the distinction is what keeps the card out of
  // the PRERENDERED html. `loading` is false before mount, so vite-ssg renders
  // /search with an empty result set and no load in flight — and with only the
  // !loading guard it baked the card into dist/search.html reading "No entity
  // on the 0 lists Ammitto covers matches the current filters". That is the
  // very claim this page exists to stop making, served to crawlers and to
  // anyone whose JavaScript has not run.
  const tag = emptyStateOpeningTag()
  assert.match(
    tag,
    /isLoaded/,
    'the empty state must require a loaded index, not merely an idle one',
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
  // The whole computed, not a fixed-width window: the guards are separated by
  // the comments explaining why each exists, and a fixed slice silently stops
  // reaching the last assertion as those grow.
  const start = source.indexOf('const nearMisses')
  const block = source.slice(start, source.indexOf('\n})', start))
  // Three separate gates, each pinned:
  //  - the index must have finished loading, or a prerender/first-paint state
  //    would produce suggestions about a corpus nobody has read yet;
  //  - the grid must actually be empty;
  //  - and the query must be the DEBOUNCED one. Keyed to the live query this
  //    ran a scan of tens of thousands of candidates synchronously inside a
  //    render on every keystroke, plus a full fold of all 61,099 rows on the
  //    first call.
  assert.match(block, /isLoaded\.value/)
  assert.match(block, /loading\.value/)
  assert.match(block, /filteredEntities\.value\.length > 0/)
  assert.match(block, /suggestFor\(debouncedQuery\.value\)/)
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

test('a suggestion replaces only the misspelt word, chosen by edit distance', () => {
  // Replacing the whole query threw away every other word: "bashar assadd" with
  // "assad" clicked became a bare "assad" — 69 results instead of the one person
  // the reader was narrowing towards.
  assert.match(source, /function applySuggestionText/)
  assert.match(
    source,
    /next\[bestIndex\] = token/,
    'the suggestion must be substituted into the query, not replace it',
  )
  // And the word to replace must be chosen by the SAME metric that produced the
  // suggestion. A common-prefix heuristic looks equivalent and is not: for
  // "qa kadhafi" suggesting "qadhafi", "qa" shares two leading characters and
  // "kadhafi" shares none, so prefix-matching swapped the wrong word and
  // produced "qadhafi kadhafi".
  assert.match(
    source,
    /boundedEditDistance\(part, token/,
    'word selection must use edit distance, not common-prefix length',
  )
  // And the comparison must be on the FOLDED word. The suggestion is folded and
  // the query word is not, so measuring the raw word inflates the distance of
  // exactly the word that needs replacing: "bashar al-assadd" compares
  // "al-assadd" to "assad" with the hyphen and particle still attached.
  assert.match(
    source,
    /for \(const part of foldForSearch\(w\)\)/,
    'each of the word\'s folded tokens must be compared, not their concatenation',
  )
})

test('a zero result is not announced before the index has loaded', () => {
  // `filteredEntities` is empty until the 20 MB index arrives, so announcing
  // unconditionally reads "0 results" to a screen reader while the honest
  // answer is "not yet known" — the audible form of the false negative this
  // whole change exists to remove.
  const block = source.slice(
    source.indexOf('const resultAnnouncement'),
    source.indexOf('\n})', source.indexOf('const resultAnnouncement')),
  )
  assert.ok(block, 'expected a composed resultAnnouncement')
  assert.match(
    block,
    /if \(!isLoaded\.value \|\| loading\.value\) return ''/,
    'the announcement must be empty until the index has loaded',
  )
  // It must carry more than the count: the scope, the date and the near misses
  // are the whole reason the empty state is worth reading, and a live region on
  // the bare count withholds all three.
  assert.match(block, /sourceCount\.value/, 'announcement must name the scope')
  assert.match(block, /asOf\.value/, 'announcement must carry the date')
  assert.match(block, /nearMisses\.value/, 'announcement must offer near misses')
  // And exactly one live region, or the same fact is announced twice.
  // Counted with comments stripped: the explanatory comments in this file
  // quote `role="status"` in prose, and counting those would make the
  // assertion pass or fail on how the rationale happens to be worded.
  const markup = source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert.equal(
    (markup.match(/role="status"/g) || []).length,
    1,
    'exactly one live region: the empty-state card must not also be one',
  )
})
