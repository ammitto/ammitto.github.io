/**
 * The search page's two clear controls must keep their split: "Clear all"
 * empties the facet filters only, and the search box's own button empties the
 * query only.
 *
 * Like `searchFilterWiring.test.js`, these are SUBSTRING AND PATTERN CHECKS
 * OVER SOURCE TEXT on plain Node: there is no harness here to mount the SFCs.
 * `tests/e2e/search-phone-filters.spec.js` proves the behaviour in the built
 * page; this file fails fast, without a browser, when the wiring is undone.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => readFileSync(join(repoRoot, relative), 'utf8')
const flatten = (source) => source.replace(/\s+/g, ' ')

const PAGE = 'src/views/SearchPage.vue'
const INPUT = 'src/components/atoms/SearchInput.vue'

/** The body of `function name() { ... }`, up to its matching brace. */
function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `expected function ${name}`)
  const open = source.indexOf('{', start)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i)
  }
  assert.fail(`function ${name} is never closed`)
}

/** The opening tag of the first `<tag` element whose attributes include `marker`. */
function openingTag(source, tag, marker) {
  let from = 0
  for (;;) {
    const start = source.indexOf(`<${tag}`, from)
    assert.notEqual(start, -1, `expected a <${tag}> carrying ${marker}`)
    const end = source.indexOf('>', start)
    const opening = source.slice(start, end + 1)
    if (opening.includes(marker)) return flatten(opening)
    from = end
  }
}

test('"Clear all" in the applied-filters bar is wired to the facets-only clear', () => {
  const bar = openingTag(read(PAGE), 'AppliedFiltersBar', '@clear=')
  assert.match(bar, /@clear="clearFacetFilters"/)
})

test('the sidebar\'s "Clear all" is the facets-only clear too', () => {
  const source = read(PAGE)
  const aside = source.slice(source.indexOf('<aside'), source.indexOf('</aside>'))
  assert.match(flatten(aside), /@clear="clearFacetFilters"/)
  assert.ok(!/@clear="clearFilters"/.test(source), 'no "Clear all" may empty the query')
})

test('the facets-only clear leaves the query alone', () => {
  const body = functionBody(read(PAGE), 'clearFacetFilters')
  assert.ok(!/searchQuery|debouncedQuery/.test(body), 'clearFacetFilters must not touch the query')
  for (const family of ['sources', 'entityTypes', 'listTypes', 'statuses']) {
    assert.match(body, new RegExp(`${family}: \\[\\]`), `clearFacetFilters must empty ${family}`)
  }
})

test('the filter drawer\'s "Clear all" is the facets-only clear too', () => {
  const source = read(PAGE)
  const drawer = source.slice(source.indexOf('<SideDrawer'), source.indexOf('</SideDrawer>'))
  assert.ok(drawer.length > 0, 'expected the filter drawer')
  assert.ok(!/clearFilters\b/.test(drawer), 'the drawer must not call the clear that also empties the query')
  assert.match(flatten(drawer), /@click="clearFacetFilters" > Clear all/)
})

test('the search box offers its own clear button, only for non-blank text', () => {
  const source = read(INPUT)
  const button = openingTag(source, 'button', 'aria-label="Clear search"')
  assert.match(button, /v-if="hasText"/)
  assert.match(button, /type="button"/, 'inside the home page form it must not submit')
  assert.match(button, /\bw-11\b/, 'a 44px touch target')
  assert.match(button, /\bh-11\b/, 'a 44px touch target')
  assert.match(button, /@click="clear"/)
  assert.match(flatten(source), /const hasText = computed\(\(\) => internalValue\.value\.trim\(\) !== ''\)/)
})

test('the search box clear empties the query and returns focus to the field', () => {
  const body = flatten(functionBody(read(INPUT), 'clear'))
  assert.match(body, /emit\('update:modelValue', ''\)/)
  assert.match(body, /focus\(\)/)
})

test('the query is no longer listed as a filter under the search box', () => {
  // The applied filters are listed once, as chips in the bar; the typed query
  // is on screen in the box and is not counted among them.
  assert.ok(!read(PAGE).includes('activeFilterCount'), 'the "N filters active" summary must be gone')
})

test('the address carries the query trimmed, so a blank query leaves no q', () => {
  const flat = flatten(read(PAGE))
  assert.match(flat, /const q = searchQuery\.value\.trim\(\) if \(q\) query\.q = q/)
  assert.ok(!flat.includes('query.q = searchQuery.value'), 'q must not be written untrimmed')
})

test('the filter drawer stops being modal the moment it starts to close', () => {
  const body = functionBody(read('src/components/molecules/SideDrawer.vue'), 'deactivate')
  const inert = body.indexOf("panel.value?.setAttribute('inert', '')")
  assert.notEqual(inert, -1, 'the closing panel must be made inert')
  assert.ok(inert < body.indexOf('setBackground(false)'), 'before the page behind is released')
})
