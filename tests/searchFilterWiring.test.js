/**
 * The consumers must keep delegating list-type filtering to the module.
 *
 * `searchFilters.test.js` proves the predicate is right. It cannot prove the
 * composable still CALLS it, nor that the page and sidebar still carry a
 * list-type selection into it: reverting `filter()` to its old inline
 * branches, or dropping the sidebar section, leaves every predicate
 * assertion green.
 *
 * Closing that by execution would mean running a Vue composable and two
 * SFCs, which needs Vite's SSR loader to resolve their `@/` aliases, `vue`
 * imports and `import.meta.env`. That harness does not exist here and these
 * tests are deliberately dependency-free on plain Node — the same reasoning
 * `birthWiring.test.js` records.
 *
 * So this file pins the wiring lexically. These are SUBSTRING AND PATTERN
 * CHECKS OVER SOURCE TEXT — they verify the call is written, not that it
 * evaluates, and a sufficiently creative rewrite can still slip past. They
 * are a narrow contract, not a behavioural test. If an application-level
 * harness is ever added, replace this file rather than keeping both.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => readFileSync(join(repoRoot, relative), 'utf8')

/** Collapse whitespace so a reformat does not fail the contract. */
const flatten = (source) => source.replace(/\s+/g, ' ')

const requireAll = (file, expressions) => {
  const flat = flatten(read(file))
  for (const expression of expressions) {
    assert.ok(
      flat.includes(flatten(expression)),
      `${file} must contain \`${expression}\``,
    )
  }
}

test('the composable loads, types and delegates list-type filtering', () => {
  const file = 'src/composables/useSearchIndex.ts'
  const source = read(file)

  // A real import declaration, not the word in a comment. The consumer
  // spells the alias like its neighbours: the relative `.js` form is only
  // required of the emitted modules themselves.
  assert.match(
    source,
    /^\s*import\s+\{[^}]*\bfilterSearchEntities\b[\s\S]*?\}\s+from\s+'@\/utils\/searchFilters'/m,
    `${file} must import filterSearchEntities from '@/utils/searchFilters'`,
  )

  requireAll(file, [
    'listType?: string',
    'const listTypeFacets = ref<FacetItem[]>([])',
    'fetch(`${API_BASE}api/v1/facets/list_types.json`)',
    'listTypeFacets.value = data.facets',
    'return filterSearchEntities(entityList, filters)',
    'listTypeFacets,',
  ])

  // The shape someone undoing the delegation would write instead.
  assert.equal(
    /listTypes\s*(!|\?)?\.?\s*includes\s*\(/.test(source),
    false,
    `${file} must not re-implement the list-type branch inline`,
  )
})

test('the composable still loads the facets it already loaded', () => {
  // Adding a request must not quietly drop the ones that were there.
  //
  // countries.json is deliberately NOT in this list. It was fetched on every
  // search-page load and nothing rendered it — `countryFacets` was declared,
  // assigned and exported, and a grep across src/ returned only those three
  // lines — so it cost 25,808 bytes (6,430 gzipped) per load for a value no
  // component read. It is also unusable as published: the facet is derived
  // from the first address line, so RUSSIA, RUSSIAN FEDERATION and 88 postal
  // addresses are separate rows and a filter built on it would miss 22% of
  // Russia matches.
  //
  // This guard exists to catch an ACCIDENTAL drop, which is the one thing it
  // cannot tell from a deliberate one — hence the note rather than a silent
  // edit. Put countries.json back here the moment the gem normalises the
  // field to ISO 3166 and something renders it.
  requireAll('src/composables/useSearchIndex.ts', [
    'fetch(`${API_BASE}api/v1/facets/authorities.json`)',
    'fetch(`${API_BASE}api/v1/facets/regimes.json`)',
    'fetch(`${API_BASE}api/v1/facets/types.json`)',
    'fetch(`${API_BASE}api/v1/facets/statuses.json`)',
    'fetch(`${API_BASE}api/v1/facets/list_types.json`)',
  ])

  // And it must not creep back unnoticed while the data is still unusable.
  const source = readFileSync(
    new URL('../src/composables/useSearchIndex.ts', import.meta.url),
    'utf8',
  )
  assert.ok(
    !source.includes('facets/countries.json'),
    'countries.json is fetched again — see the note above; it needs a consumer ' +
      'and an ISO-normalised field first',
  )
})

test('the search page carries list types through URL, counts and filtering', () => {
  const file = 'src/views/SearchPage.vue'

  requireAll(file, [
    'listTypes: [] as string[]',
    // The round trip: out of the URL on mount, back into it on change.
    'const { q, source, type, list, status } = route.query',
    'filters.value.listTypes = queryList(list)',
    'query.list = filters.value.listTypes',
    // Into the filtering, and into the counts the pills render.
    'listTypes: filters.value.listTypes.length > 0 ? filters.value.listTypes : undefined',
    'listTypeCountsMap[facet.code] = facet.count',
    'listTypes: listTypeCountsMap',
    // Cleared and counted alongside the other three families.
    'filters.value.listTypes.length > 0',
    'listTypes: [],',
  ])

  assert.match(
    read(file),
    /^\s*import\s+\{[^}]*\blistTypes\b[^}]*\}\s+from\s+'@\/config'/m,
    `${file} must label chips from the '@/config' list, not the facet name`,
  )
})

test('the sidebar renders and toggles the published list options', () => {
  const file = 'src/components/organisms/SearchFilters.vue'

  requireAll(file, [
    'listTypes: string[]',
    'listTypes: Record<string, number>',
    'counts.listTypes[listType.code]',
    'filters.listTypes.includes(listType.code)',
    '@click="toggleListType(listType.code)"',
  ])

  assert.match(
    read(file),
    /^\s*import\s+\{[^}]*\blistTypes\b[^}]*\}\s+from\s+'@\/config'/m,
    `${file} must take its options from '@/config' like the other families`,
  )
})

test('the configured options keep the decisions this change made', () => {
  const flat = flatten(read('src/config/index.ts'))

  assert.ok(flat.includes('export const listTypes = ['), 'config must export listTypes')

  // The facet file supplies a title-cased name, so an "unused config"
  // cleanup would silently relabel this "Sdn List".
  assert.ok(
    flat.includes("{ code: 'sdn-list', name: 'SDN List' }"),
    "config must spell sdn-list 'SDN List', not the facet's title-cased form",
  )

  // The producer emits this value; without a pill the rows carrying it are
  // unreachable through the facet, since every other selection excludes them.
  assert.ok(
    flat.includes("{ code: 'unknown', name: 'Unknown' }"),
    'config must keep the unknown list type selectable',
  )
})

test('the tests execute the emitted filter module', () => {
  const suite = read('tests/searchFilters.test.js')

  assert.match(
    suite,
    /from\s+'\.\.\/\.test-build\/utils\/searchFilters\.js'/,
    'searchFilters.test.js must import the emitted module',
  )
  assert.equal(
    /(function|const|let|var)\s+filterSearchEntities\b/.test(suite),
    false,
    'searchFilters.test.js must not define its own filter',
  )
})

test('the filter module is compiled for the unit tests', () => {
  // A module absent from this list emits nothing, and its test then fails
  // with "module not found" — which reads as a broken import rather than
  // the missing coverage it actually is.
  assert.ok(
    read('tsconfig.test.json').includes('src/utils/searchFilters.ts'),
    'tsconfig.test.json must include src/utils/searchFilters.ts',
  )
})
