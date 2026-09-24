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
    /watch\(searchQuery, \(\) => \{\s*if \(!partialQueryPending\.value\) return\s*resetPartial\(\)/,
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

test('without an index total the banner still counts the partial matches', () => {
  const body = computedBody('progressMessage')
  const noTotal = body.slice(body.indexOf('if (!total) {'), body.indexOf('const checked'))
  assert.notEqual(body.indexOf('if (!total) {'), -1, 'expected a branch for a missing total')
  assert.match(noTotal, /if \(n === 0\) return `No matches for/)
  assert.match(noTotal, /return `\$\{found\} for \$\{q\} so far\./)
  assert.ok(!/total\.toLocaleString|of \$\{/.test(noTotal), 'no "of N" without a total')
  assert.match(body, /const found = countOf\(n, 'match', 'matches'\)/)
  assert.match(body, /of \$\{countOf\(total, 'record', 'records'\)\} checked/)
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
  // With the list's own seen set: rebuilding one from every shown id at each
  // refresh is the cost this avoids.
  assert.match(page, /appendNewMatches\(partialIds\.value, [^;\n]*, partialSeen\)/)
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

test('the partial search reads rows from the raw Map, not through reactive proxies', () => {
  // Through the reactive Map every get wraps its row in a new proxy, per match
  // per refresh; a short prefix mid-build matches tens of thousands of rows.
  const partial = composable.slice(composable.indexOf('function searchPartial('))
  const body = partial.slice(0, partial.indexOf('\n}\n'))
  assert.match(body, /const rows = toRaw\(entities\.value\)/)
  assert.match(body, /\.map\(\(id\) => rows\.get\(id\)\)/)
  assert.ok(!/entities\.value\.get/.test(body))
})

test('partial cards mount in steps, and every restart of the list drops what was pending', () => {
  const reset = page.slice(page.indexOf('function resetPartial()'))
  const body = reset.slice(0, reset.indexOf('\n}\n'))
  for (const line of [
    'clearMountTimer()',
    'partialIds.value = []',
    'partialSeen = new Set()',
    'partialMounted.value = 0',
    'partialCards = new Map()',
  ]) {
    assert.ok(body.includes(line), `resetPartial must run ${line}`)
  }
  // The keystroke, the settled query or filter, and the end of the build.
  assert.match(page, /watch\(\[debouncedQuery, filters\], \(\) => \{\s*resetPartial\(\)\s*refreshPartial\(\)/)
  assert.match(page, /watch\(showPartial, \(partial\) => \{\s*if \(partial\) return\s*clearPartialTimer\(\)\s*resetPartial\(\)/)
  assert.match(page, /onBeforeUnmount\(\(\) => \{[^}]*clearMountTimer\(\)/)
})

test('the card cache serves the partial list only', () => {
  const body = computedBody('paginatedEntities')
  const partialBranch = body.slice(0, body.indexOf('return filteredEntities.value'))
  assert.match(partialBranch, /if \(showPartial\.value\)/)
  assert.match(partialBranch, /partialCards\.get\(id\)/)
  assert.match(partialBranch, /Math\.min\(loadedCount\.value, partialMounted\.value\)/)
  const finalBranch = body.slice(body.indexOf('return filteredEntities.value'))
  assert.ok(!/partialCards/.test(finalBranch), 'the final list must not read the partial card cache')
  assert.equal(page.match(/partialCards = new Map\(\)/g).length, 1, 'only resetPartial replaces the cache')
})
