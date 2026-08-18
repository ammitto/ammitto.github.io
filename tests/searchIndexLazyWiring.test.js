/**
 * The search index must load only where it is used.
 *
 * `useSearchIndex()` used to start the download inside the composable
 * itself, on first use. `useEntityData` calls that composable to reach
 * `loadFullEntity`, so opening any entity page fetched the whole corpus —
 * and then read nothing from it. `loadFullEntity` takes a ref, derives it
 * from the IRI by string replacement, and fetches that one node file.
 * `loadEntries` fetches entry nodes the same way.
 *
 * `loadEntity` also awaited that download before doing any of its own
 * work, so the page did not merely pay for the bytes, it waited on them.
 *
 * Nothing fails when the eager load comes back: the entity page renders
 * identically, and every other test stays green. The regression is
 * invisible except as time on the wire, which is why this file has to say
 * so.
 *
 * These are SUBSTRING AND PATTERN CHECKS OVER SOURCE TEXT — they verify
 * what is written, not what evaluates, for the reason set out at the top
 * of birthWiring.test.js.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => readFileSync(join(repoRoot, relative), 'utf8')

/** Strip comments, so prose describing the ban cannot satisfy it. */
const code = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')

const COMPOSABLE = 'src/composables/useSearchIndex.ts'
const ENTITY_DATA = 'src/composables/useEntityData.ts'
const SEARCH_PAGE = 'src/views/SearchPage.vue'

test('constructing the composable does not start the download', () => {
  const source = code(read(COMPOSABLE))
  const body = source.slice(source.indexOf('export function useSearchIndex()'))

  // The function returns bindings; it must not call the loaders itself.
  const returnAt = body.indexOf('return {')
  const beforeReturn = body.slice(0, returnAt === -1 ? undefined : returnAt)

  assert.ok(
    !/\bloadSearchIndex\(\)/.test(beforeReturn),
    'useSearchIndex must not call loadSearchIndex when constructed',
  )
  assert.ok(
    !/\bloadFacets\(\)/.test(beforeReturn),
    'useSearchIndex must not call loadFacets when constructed',
  )
})

test('the entity page does not wait on the search index', () => {
  const source = code(read(ENTITY_DATA))

  assert.ok(
    !/await\s+loadSearchIndex\(\)/.test(source),
    'the entity path must not await the corpus before fetching its node',
  )
  // Taking only what it uses is what keeps the coupling gone; pulling the
  // loader back into scope is the first step to calling it again.
  assert.match(
    source,
    /const\s*\{\s*loadFullEntity\s*\}\s*=\s*useSearchIndex\(\)/,
    'useEntityData should destructure only loadFullEntity',
  )
})

test('the search page still loads the index itself', () => {
  const source = code(read(SEARCH_PAGE))

  // Removing the eager load is only safe because the page that needs the
  // index asks for it. If this ever goes, search silently has no data.
  assert.match(
    source,
    /loadSearchIndex\(\)/,
    'SearchPage must load the search index on its own',
  )
  assert.match(
    source,
    /loadFacets\(\)/,
    'SearchPage must load the facets on its own',
  )
})
