/**
 * The API docs page has to describe the API we actually publish.
 *
 * Nothing enforced that. The page drifted for months without a single
 * test going red: it advertised `https://ammitto.github.io/api/v1`,
 * which 301s to www.ammitto.org; it listed two endpoints against a
 * catalogue that advertises five files and eleven collections; its
 * sample carried `"@context": "https://schema.org"`, which the producer
 * has never emitted; and its Ruby example read
 * `stats['totals']['entities']` when stats.json puts `total_entities`
 * at the top level, so the one example a reader would paste returned
 * nil.
 *
 * The committed `public/api/v1` snapshot cannot be used as the truth
 * here: it is a CN-only, 323-entity fixture from 2026-03-03, and
 * deploy.yml deletes it (`rm -rf ../public/api/v1`) before harmonizing
 * fresh, so it is not what anyone is served.
 *
 * These are SUBSTRING AND PATTERN CHECKS OVER SOURCE TEXT — they verify
 * what is written, not what evaluates, for the reason set out at the top
 * of birthWiring.test.js. They pin the mistakes that were actually made
 * and the shape every entry must keep. Whether a documented path returns
 * 200 today is a property of the deployed site and is NOT proved here;
 * re-read `/api/v1/index.jsonld` when this page is next revised.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const page = readFileSync(join(root, 'src/views/ApiDocsPage.vue'), 'utf8')
const schemaPage = readFileSync(join(root, 'src/views/SchemaPage.vue'), 'utf8')

// Both pages hand a reader a JSON-LD sample, and the identical two
// untruths were in both: a schema.org context and a `Name` node type.
// Fixing one and leaving the other is how the second one survives.
//
// Check the SAMPLES, not the whole file: the comments above them quote
// the wrong values on purpose, to say what was wrong and why. A check
// over the raw text bans the explanation along with the mistake.
//
// Match the JSON samples by the key that introduces them rather than by
// pairing backticks. The JavaScript example contains ESCAPED backticks
// inside its own template literal, so a naive /`[^`]*`/ pairs the wrong
// delimiters and splits one sample into fragments: it recovered 3,745 of
// ApiDocsPage's 9,731 characters and dropped the JavaScript example
// entirely, which would let a wrong value in a sample pass unseen.
//
// Count what was declared against what was captured. Matching only
// literal blocks means a sample rewritten as an expression —
// `response: someVariable` — keeps its `response:` key, so the
// completeness test below still passes while the sample itself drops out
// of these checks and stops being examined at all. Comparing the two
// counts turns that into a failure instead of a silent gap.
const jsonSamplesOf = (text, fileName) => {
  const captured = [
    ...text.matchAll(/response:\s*`([\s\S]*?)`/g),
    ...text.matchAll(/const entitySchema = `([\s\S]*?)`/g),
  ].map(([, sample]) => sample)
  const declared =
    [...text.matchAll(/^\s*response:/gm)].length +
    [...text.matchAll(/^const entitySchema =/gm)].length
  assert.equal(
    captured.length,
    declared,
    `${fileName}: ${declared - captured.length} sample(s) declared but not ` +
      'captured — a sample that is not a literal block is never checked',
  )
  return captured.join('\n')
}

const samplePages = [
  ['ApiDocsPage.vue', jsonSamplesOf(page, 'ApiDocsPage.vue')],
  ['SchemaPage.vue', jsonSamplesOf(schemaPage, 'SchemaPage.vue')],
]

test('documents the canonical API host, not one that redirects', () => {
  assert.match(
    page,
    /const baseUrl = 'https:\/\/www\.ammitto\.org\/api\/v1'/,
    'baseUrl must be the canonical host',
  )
  // ammitto.github.io 301s to www.ammitto.org. A redirect is fine in a
  // browser and a silent failure in `curl` without -L, which is exactly
  // how these examples are written.
  assert.ok(
    !page.includes('ammitto.github.io'),
    'no example may point at the redirecting host',
  )
})

test('every code example builds its URL from baseUrl', () => {
  // A hardcoded host is how the page went stale the first time: baseUrl
  // was corrected once and the examples underneath it were not.
  //
  // The context IRI is the exception and is NOT a mistake. The producer
  // emits `https://ammitto.org/api/v1/context.jsonld` without `www`;
  // that IRI 301s to the www host and returns 200 application/ld+json,
  // so every processor that follows redirects resolves it. It is an
  // identifier appearing inside a sample, not a host we tell anyone to
  // fetch from. Do not "correct" it to match baseUrl.
  const CONTEXT_IRI = 'https://ammitto.org/api/v1/context.jsonld'
  assert.ok(page.includes(CONTEXT_IRI), 'samples must show the emitted context IRI')
  for (const m of page.replaceAll(CONTEXT_IRI, '').matchAll(
    /https:\/\/[a-z.]*ammitto\.[a-z]+\/api\/v1/g,
  )) {
    assert.equal(
      m[0],
      'https://www.ammitto.org/api/v1',
      `literal API host in the page: ${m[0]} — interpolate baseUrl instead`,
    )
  }
})

test('the stats example reads the keys stats.json actually has', () => {
  // stats.json is flat: total_entities / total_entries / total_regimes
  // alongside a `sources` map. There is no `totals` object to index.
  assert.ok(
    !/\['totals'\]|\btotals\[/.test(page),
    'stats.json has no `totals` key — the totals are top-level',
  )
  assert.ok(
    page.includes("stats['total_entities']"),
    'the Ruby example must read the key that exists',
  )
})

test('samples show the context the producer emits', () => {
  // Every document we publish references our own context. schema.org
  // appeared in hand-written samples and matches nothing we serve.
  for (const [name, text] of samplePages) {
    assert.ok(!text.includes('schema.org'), `${name}: we do not emit a schema.org context`)
    assert.ok(
      text.includes('https://ammitto.org/api/v1/context.jsonld'),
      `${name}: samples must show the context we do emit`,
    )
  }
})

test('name nodes carry the type the API emits', () => {
  // Entity `names` entries are NameVariant, not Name. Both pages claimed
  // Name, which no consumer would match on.
  for (const [name, text] of samplePages) {
    assert.ok(!/"@type": "Name"/.test(text), `${name}: names are NameVariant nodes`)
    assert.ok(
      text.includes('"@type": "NameVariant"'),
      `${name}: the sample must show the type we emit`,
    )
  }
})

test('the schema page documents the link to the entry graph', () => {
  // hasSanctionEntry is the only route from an entity to why it is
  // listed. It was in neither the sample nor the field table.
  assert.ok(
    schemaPage.includes('hasSanctionEntry'),
    'SchemaPage must document hasSanctionEntry',
  )
})

test('each endpoint entry is complete', () => {
  const entries = page.slice(
    page.indexOf('const endpoints = ['),
    page.indexOf('const codeExamples'),
  )
  // Pin the exact set rather than a floor. "At least seven" would still
  // pass if /stats.json were dropped and /index.jsonld duplicated, or if
  // a path drifted to a 404 while the total held. The catalogue at
  // /index.jsonld is the source for this list.
  const paths = [...entries.matchAll(/^\s*path:\s*'([^']+)'/gm)].map(([, v]) => v)
  assert.deepEqual(paths, [
    '/index.jsonld',
    '/stats.json',
    '/sources/{source}.jsonld',
    '/node/entity/{source}/{id}.jsonld',
    '/all.jsonld and /all.ttl',
    '/ontology/classes.jsonld',
    '/facets/{facet}.json',
  ])
  for (const field of ['method:', 'description:', 'example:', 'response:']) {
    assert.equal(
      [...entries.matchAll(new RegExp(`^\\s*${field}`, 'gm'))].length,
      paths.length,
      `every endpoint needs ${field.slice(0, -1)}`,
    )
  }
})
