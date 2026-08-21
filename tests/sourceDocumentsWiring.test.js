/**
 * The download link must point at the document the page actually loaded.
 *
 * `EntityPage` offers the reader the JSON-LD behind the record. That link
 * is built in the page, while the fetch is built in `useSearchIndex`'s
 * `loadFullEntity`. Two places constructing the same path is exactly the
 * shape that has drifted twice in this repo already — `SOURCES_WITHOUT_
 * AGGREGATE` against the threshold manifest, and the Ruby gem page against
 * the gem's own API. So the path is pinned here against the fetch it is
 * supposed to mirror.
 *
 * A link that 404s is worse than no link: it says the data is published
 * and then fails, which reads as the data not existing.
 *
 * These are SUBSTRING AND PATTERN CHECKS OVER SOURCE TEXT — they verify
 * what is written, not what evaluates, for the reason set out at the top
 * of birthWiring.test.js. Whether the deployed path returns 200 is a
 * property of the published site and is NOT proved here.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

const page = read('src/views/EntityPage.vue')
const searchIndex = read('src/composables/useSearchIndex.ts')
const component = read('src/components/molecules/SourceDocuments.vue')

test('the entity link mirrors the path loadFullEntity fetches', () => {
  // loadFullEntity: `${API_BASE}api/v1/node/entity/${ref}.jsonld`
  assert.match(
    searchIndex,
    /api\/v1\/node\/entity\/\$\{ref\}\.jsonld/,
    'the fetch path changed — update the download link to match',
  )
  assert.match(
    page,
    /api\/v1\/node\/entity\/\$\{ref\}\.jsonld/,
    'the download link must use the same path as the fetch',
  )
})

test('the source aggregate link uses the published layout', () => {
  assert.match(page, /api\/v1\/sources\/\$\{source\.value\}\.jsonld/)
})

test('links respect the deployment base path', () => {
  // The site is served from a base that is not guaranteed to be "/".
  // A root-relative link would break wherever that base is not root.
  const links = [...page.matchAll(/href: `([^`]+)`/g)].map(([, h]) => h)
  assert.ok(links.length >= 2, `expected the entity documents, found ${links.length}`)
  for (const href of links) {
    assert.ok(
      href.startsWith('${base}'),
      `${href} must be built from BASE_URL, not root-relative`,
    )
  }
})

test('no Turtle is offered where the producer emits none', () => {
  // Per-node and per-source documents are JSON-LD only; .ttl exists for
  // the whole graph and nothing smaller, so a per-entity .ttl link would
  // 404. Verified against the live API: node/entity/au/100.ttl and
  // sources/tr.ttl both return 404.
  assert.ok(!/\.ttl/.test(page), 'EntityPage must not offer a per-record .ttl')
})

test('the component renders nothing when there is nothing to offer', () => {
  // An empty panel headed "Data for this entity" is worse than no panel.
  assert.match(component, /v-if="documents\.length"/)
})
