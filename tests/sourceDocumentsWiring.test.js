/**
 * The download link must point at the document the page actually loaded.
 *
 * `EntityPage` offers the reader the JSON-LD behind the record, and
 * `useSearchIndex`'s `loadFullEntity` fetches it. They used to build that
 * path independently, with a third unused copy in `entityUrls.ts`, and
 * this file pinned the two copies against each other by substring — which
 * reports a divergence only after it has happened. They now call one
 * exported helper, and the checks below cover the helper's output and the
 * fact that both consumers use it.
 *
 * A link that 404s is worse than no link: it says the data is published
 * and then fails, which reads as the data not existing. That is why the
 * source aggregate is offered only where the deploy publishes one.
 *
 * The remaining checks are SUBSTRING AND PATTERN CHECKS OVER SOURCE TEXT
 * — they verify what is written, not what evaluates, for the reason set
 * out at the top of birthWiring.test.js. Whether the deployed path returns
 * 200 is a property of the published site and is NOT proved here.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  getEntityNodePath,
  getEntitySourceCode,
} from '../.test-build/utils/entityUrls.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

const page = read('src/views/EntityPage.vue')
const searchIndex = read('src/composables/useSearchIndex.ts')
const component = read('src/components/molecules/SourceDocuments.vue')

// The markup with HTML comments stripped. The comments deliberately quote
// the things these checks ban — that is what makes them explanations — so a
// check over the raw text bans the explanation along with the mistake.
const markup = component.replace(/<!--[\s\S]*?-->/g, '')

test('the node path helper builds the published layout', () => {
  assert.equal(
    getEntityNodePath('uk/aqd0087', '/'),
    '/api/v1/node/entity/uk/aqd0087.jsonld',
  )
})

test('the node path helper honours the deployment base', () => {
  // The site is not guaranteed to be served from "/". A root-relative
  // path would break wherever it is not.
  assert.equal(
    getEntityNodePath('uk/aqd0087', '/ammitto/'),
    '/ammitto/api/v1/node/entity/uk/aqd0087.jsonld',
  )
})

test('the node path helper accepts a full IRI as well as a ref', () => {
  // `loadFullEntity` is called with either; it used to strip the IRI
  // prefix itself, which is now the helper's job for both callers.
  assert.equal(
    getEntityNodePath('https://www.ammitto.org/entity/uk/aqd0087', '/'),
    '/api/v1/node/entity/uk/aqd0087.jsonld',
  )
})

test('the aggregate source comes from the validated entity ref', () => {
  // Many published entities have no sourceReferences, but their canonical
  // ref still begins with the source whose aggregate contains the record.
  assert.equal(getEntitySourceCode('cn/1-general-dynamics'), 'cn')
  assert.equal(
    getEntitySourceCode('https://www.ammitto.org/entity/jp/jp-example'),
    'jp',
  )

  // The source must not be recovered with a raw split from a ref that the
  // node-document path itself refuses to address.
  assert.equal(getEntitySourceCode('cn/../../secret'), null)
  assert.equal(getEntitySourceCode('cn//secret'), null)
})

test('the base parameter carries no default', () => {
  // A default would put back the trap the helper exists to remove: a
  // caller that forgets the base gets a root-relative path, which works
  // in development and breaks wherever the site is served from a
  // subpath. That is what the unused `getEntityApiUrl` did. Every call
  // site is compiler-checked, so this covers the one mutation the
  // compiler would accept — reintroducing the default itself.
  const helper = read('src/utils/entityUrls.ts')
  assert.match(
    helper,
    /getEntityNodePath\(ref: string, base: string\)/,
    'getEntityNodePath must require its base',
  )
})

test('the link and the fetch both come from that helper', () => {
  // The point of the helper is that neither can be edited alone. Pinning
  // two copies of a string against each other could only ever report a
  // divergence after it happened.
  for (const [name, source] of [['EntityPage', page], ['useSearchIndex', searchIndex]]) {
    assert.match(
      source,
      /getEntityNodePath\(/,
      `${name} must build the node path with getEntityNodePath`,
    )
    assert.ok(
      !/api\/v1\/node\/entity\//.test(source),
      `${name} must not spell the node path out again`,
    )
  }
})

test('the source aggregate is offered only where one is published', () => {
  // `sources/ru.jsonld` is a 404 and `ru` is in SOURCES_WITHOUT_AGGREGATE.
  // Offering it would send a reader to a missing file.
  assert.match(page, /const aggregateSource = getEntitySourceCode\(ref\)/)
  assert.match(page, /publishesAggregate\(aggregateSource\)/)
  assert.match(
    page,
    /api\/v1\/sources\/\$\{encodeURIComponent\(aggregateSource\)\}\.jsonld/,
  )
  assert.doesNotMatch(
    page,
    /publishesAggregate\(source\.value\)/,
    'missing sourceReferences must not hide the aggregate document',
  )
})

test('the aggregate link respects the deployment base path', () => {
  const links = [...page.matchAll(/href: `([^`]+)`/g)].map(([, h]) => h)
  assert.ok(links.length >= 1, `expected the aggregate document, found ${links.length}`)
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

test('the chip carries no decorative glyph', () => {
  // A span containing only "↓" made axe decline to decide that node's
  // contrast — "Element content contains only non-text characters ...
  // nonBmp" — and tests/e2e/contrast-dom.spec.js treats undecidable as a
  // failure. It shipped red on exactly this. The label and note already
  // say what the control does.
  assert.ok(!/aria-hidden="true"/.test(markup), 'no decorative glyph span')
  assert.ok(!/[\u2190-\u21FF]/.test(markup), 'no arrow characters in the markup')
})

test('the link says that it downloads and shows its focus ring only for keyboard focus', () => {
  assert.match(markup, />\s*Download\s*<\/span>/)
  assert.match(markup, /focus-visible:outline-none/)
  assert.match(markup, /focus-visible:ring-2/)
  assert.match(markup, /focus-visible:ring-brand-link/)
  assert.ok(!/(?<!-)focus:outline-none/.test(markup), 'no focus ring on pointer focus')
})

test('the download note gets its own readable row on a narrow screen', () => {
  assert.match(markup, /grid-cols-\[auto_minmax\(0,1fr\)\]/)
  assert.match(markup, /sm:grid-cols-\[auto_minmax\(0,1fr\)_auto\]/)
  assert.match(markup, /col-start-2 sm:col-start-auto/)
})

test('a long identifier can shrink rather than overflow', () => {
  // A flex item defaults to min-width:auto and will not shrink below its
  // content, so a long source/id in a monospace label pushed past 320px.
  assert.match(markup, /min-w-0/)
  assert.match(markup, /break-all/)
})

test('the region is named per instance, without an id', () => {
  // A heading inside a <section> does not give the region a programmatic
  // name, and a hardcoded id collides when two instances render.
  assert.match(markup, /:aria-label=/)
  assert.ok(!/aria-labelledby/.test(markup), 'no id-based labelling')
})
