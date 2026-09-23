/**
 * Wiring of the search page's partial results ("progressive results").
 *
 * While the index builds, the page shows matches found so far under a banner
 * that says the search is still running. What must NOT follow the partial
 * answer is anything a reader could file as a verdict: the result count, the
 * "No match found" card, the near misses, and the page's single live region.
 * Those are template and computed relationships, so this reads the source, in
 * the style of searchSkeletonWiring.test.js. The behaviour itself is covered
 * by tests/e2e/search-progressive.spec.js.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../src/views/SearchPage.vue', import.meta.url), 'utf8')
const composable = readFileSync(
  new URL('../src/composables/useSearchIndex.ts', import.meta.url),
  'utf8',
)

/** The body of `const name = computed(() => { ... })` up to the next top-level const. */
function computedBody(name) {
  const start = page.indexOf(`const ${name} = computed(`)
  assert.notEqual(start, -1, `expected a computed named ${name}`)
  const end = page.indexOf('\nconst ', start + 1)
  return page.slice(start, end === -1 ? undefined : end)
}

/** The opening tag of the element carrying `marker`. */
function openingTag(marker) {
  const at = page.indexOf(marker)
  assert.notEqual(at, -1, `expected ${marker}`)
  const start = page.lastIndexOf('<', at)
  return page.slice(start, page.indexOf('>', at) + 1)
}

test('partial results show only while building and only for a typed query', () => {
  const body = computedBody('showPartial')
  assert.match(body, /!isLoaded\.value \|\| loading\.value/)
  assert.match(body, /debouncedQuery\.value\.trim\(\) !== ''/)
  assert.match(body, /searchQuery\.value\.trim\(\) !== ''/)
})

test('a query edit clears the partial list at the keystroke, and no stale refresh restores it', () => {
  assert.match(
    page,
    /watch\(searchQuery, \(\) => \{\s*if \(!partialQueryPending\.value\) return\s*partialIds\.value = \[\]\s*partialChecked\.value = 0/,
  )
  const refresh = page.slice(page.indexOf('function refreshPartial('), page.indexOf('// An edit to the query'))
  assert.match(refresh, /if \(!showPartial\.value \|\| partialQueryPending\.value\) return/)
})

test('the partial list is filtered like the final one, and records how far it checked', () => {
  const refresh = page.slice(page.indexOf('function refreshPartial('), page.indexOf('// An edit to the query'))
  assert.match(refresh, /filter\(searchPartial\(debouncedQuery\.value, \d+\), filterSelection\.value\)/)
  assert.match(refresh, /partialChecked\.value = checked/)
  assert.match(computedBody('filteredEntities'), /filter\(results, filterSelection\.value\)/)
})

test('timers are cleared on unmount', () => {
  const m = page.match(/onBeforeUnmount\(\(\) => \{([\s\S]*?)\n\}\)/)
  assert.ok(m, 'expected an onBeforeUnmount hook')
  assert.match(m[1], /clearPartialTimer\(\)/)
  assert.match(m[1], /clearTimeout\(debounceTimer\)/)
})

test('while loading, the live region says only that the search is incomplete', () => {
  assert.match(
    computedBody('resultAnnouncement'),
    /if \(!isLoaded\.value \|\| loading\.value\) \{\s*return showPartial\.value \? partialNotice\(debouncedQuery\.value\.trim\(\)\) : ''\s*\}/,
  )
  const notice = page.match(/const partialNotice = \(query: string\) =>\s*`([^`]*)`/)
  assert.ok(notice, 'expected a partialNotice template')
  // The query is its only interpolation: no count to re-announce at every
  // refresh, and no negative.
  assert.deepEqual(notice[1].match(/\$\{[^}]*\}/g), ['${query}'])
  const fixed = notice[1].replace('${query}', '').replace(/\\u201[cd]/g, '')
  assert.ok(!/\d|No match/.test(fixed))
  assert.match(notice[1], /not complete/)
})

test('the progress banner is gated on the partial state and is not a live region', () => {
  const tag = openingTag('data-testid="search-progress"')
  assert.match(tag, /v-if="showPartial"/)
  assert.ok(!/aria-live|role=/.test(tag), 'the banner must not be a second live region')
  assert.equal(
    (page.match(/aria-live=/g) || []).length,
    1,
    'resultAnnouncement must stay the page\'s one live region',
  )
})

test('the banner never states a negative', () => {
  const body = computedBody('progressMessage')
  assert.ok(!/No match found|No match\b/.test(body))
  assert.match(body, /not finished|not complete/)
})

test('verdicts stay gated on the finished build', () => {
  for (const name of ['filteredEntities', 'nearMisses', 'resultAnnouncement']) {
    assert.match(
      computedBody(name),
      /if \(!isLoaded\.value \|\| loading\.value\) (\{\s*)?return/,
      `${name} must answer nothing until the index is fully built`,
    )
  }
  assert.ok(!/searchPartial/.test(computedBody('filteredEntities')), 'the final list must come from search()')
  assert.match(page, /v-if="isLoaded && !loading && filteredEntities\.length === 0"/)
  assert.match(page, /<p v-if="isLoaded" class="text-sm/, 'the result count shows only once loaded')
})

test('partial cards come from appendNewMatches, so they never move while loading', () => {
  assert.match(page, /partialIds\.value = appendNewMatches\(partialIds\.value,/)
  assert.ok(
    !/partialIds\.value = [^;\n]*\.sort\(/.test(page),
    'partial ids must not be re-sorted mid-load',
  )
  const body = computedBody('paginatedEntities')
  assert.match(body, /if \(showPartial\.value\)[\s\S]*partialIds\.value/)
})

test('search() keeps its null-index guard; the partial path uses its own index', () => {
  const search = composable.slice(composable.indexOf('function search('), composable.indexOf('function searchPartial('))
  assert.match(search, /if \(!searchIndex\.value\) \{\s*return \[\]/)
  const partial = composable.slice(composable.indexOf('function searchPartial('))
  assert.match(partial.slice(0, 400), /if \(isLoaded\.value \|\| !partialIndex\) return \[\]/)
  assert.match(partial.slice(0, 400), /partialMatchIds\(partialIndex, query, repeatedIds, limit\)/)
})

test('repeated ids are known before the partial index is exposed, and it is dropped after', () => {
  const repeated = composable.indexOf('repeatedIds = repeated')
  const exposed = composable.indexOf('partialIndex = index')
  const build = composable.indexOf('const text = searchRowText(entity)')
  assert.ok(repeated !== -1 && exposed !== -1 && build !== -1)
  assert.ok(repeated < exposed && exposed < build)
  const finallyBlock = composable.slice(composable.indexOf('} finally {', build))
  assert.match(finallyBlock.slice(0, 200), /partialIndex = null/)
})

test('progress is published at a yield, not per row', () => {
  // Per row it would re-run every watcher 61k times inside the build steps.
  const visit = composable.slice(
    composable.indexOf('const text = searchRowText(entity)'),
    composable.indexOf('yieldControl: () => {'),
  )
  assert.ok(!/indexedCount\.value =/.test(visit))
  assert.match(composable, /yieldControl: \(\) => \{\s*indexedCount\.value = added/)
})
