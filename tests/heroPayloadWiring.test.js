/**
 * The front page must not download the corpus to count it.
 *
 * `HeroSection` fetched `search-index.json` — every row in the corpus,
 * megabytes of it — read `metadata.totalEntities` off the top, and discarded
 * the rest. It then fetched `stats.json`, a few hundred bytes, three lines
 * later. Both numbers were in the small one.
 *
 * Nothing fails when the large fetch returns: the page renders the same
 * figures, every other test stays green, and the only symptom is that the
 * first view of the site carries a payload it never reads. That is
 * precisely why this file has to say so. A later change reaching for the
 * search index here would look reasonable in review.
 *
 * These are SUBSTRING AND PATTERN CHECKS OVER SOURCE TEXT — they verify
 * what is written, not what evaluates, for the reason set out at the top of
 * birthWiring.test.js. Real payload sizes are a property of the deployed
 * site and are not measured here.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => readFileSync(join(repoRoot, relative), 'utf8')

const HERO = 'src/components/organisms/HeroSection.vue'
// The fetch moved to the page. HeroSection used to fetch stats.json while
// HomePage fetched the very same file on the very same render — two requests
// for one payload — so the page now fetches once and passes the figures down.
// These checks follow the fetch rather than the component name.
const HOME = 'src/views/HomePage.vue'
const FETCHER = HOME

/** Strip comments, so the prose explaining the ban does not satisfy it. */
const code = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/<!--[\s\S]*?-->/g, ' ')

test('the front page does not fetch the search index', () => {
  // The ban covers BOTH files: whichever of them holds the fetch, the front
  // page must not pull the corpus down to read one integer off the top.
  for (const file of [HERO, HOME]) {
    assert.ok(
      !/search-index/.test(code(read(file))),
      `${file} must not reference search-index.json: it is the entire ` +
        'corpus, and the front page needs one integer from it',
    )
  }
})

test('the hero itself fetches nothing', () => {
  // It renders figures it is handed. A fetch reappearing here is how the
  // duplicate request came about the first time.
  assert.equal(
    (code(read(HERO)).match(/\bfetch\(/g) || []).length,
    0,
    `${HERO} must take its counts as props, not fetch them`,
  )
})

/**
 * The check above matches one contiguous token, so `'search' + '-index'`
 * walks past it. Rather than chase spellings, this pins the whole set: the
 * hero may fetch these two paths and nothing else. A reintroduced corpus
 * download fails here however it is spelled, because the literal it passes
 * to fetch is not on the list — and a genuinely new endpoint fails too,
 * which is the point at which someone should think about payload again.
 */
test('the front page fetches only the two small documents', () => {
  const source = code(read(FETCHER))
  // The front page renders the register's contents, so it reads the facet
  // summaries as well as stats. Every entry here is a summary document —
  // {code, name, count} rows, hundreds of bytes locally and a few KB on the
  // full fifteen-source deploy. The corpus itself (search-index.json,
  // all.jsonld) is NOT on this list and must never be: that is the whole
  // point of the file. A genuinely new endpoint failing here is the moment to
  // think about payload again, which is why the list is exhaustive.
  // stats.json carries the record count and the build date. The entity node is
  // ONE real record (573 bytes) shown as a worked example, so a visitor can see
  // what a result contains without searching blind — fetched rather than mocked
  // so it can never drift from what the site serves. The corpus itself
  // (search-index.json, all.jsonld) is NOT on this list and must never be:
  // that is the whole point of this file. A genuinely new endpoint failing here
  // is the moment to think about payload again.
  const allowed = [
    '/api/v1/stats.json',
    '/api/v1/node/entity/cn/1-lockheed-martin-corporation.jsonld',
  ]

  const calls = [...source.matchAll(/\bfetch\(/g)]
  const fetched = [...source.matchAll(/\bfetch\(\s*([`'"])([^`'"]*)\1/g)]
    .map((m) => m[2])

  assert.ok(calls.length > 0, `${FETCHER} makes no fetch call at all`)

  // Every call must pass a literal, or the check below cannot see it:
  // `const url = '/api/v1/' + 'search' + '-index.json'; fetch(url)` has no
  // literal inside fetch(...) and would otherwise sail past an allowed-set
  // that only inspects what it can read. Writing the path inline is not a
  // style preference here, it is what makes the payload reviewable.
  assert.equal(
    fetched.length,
    calls.length,
    `${FETCHER} calls fetch() with something other than a literal path; ` +
      'write the path inline so this file can see what the page downloads',
  )

  for (const url of fetched) {
    assert.ok(
      allowed.includes(url),
      `${FETCHER} fetches ${url}; allowed: ${allowed.join(', ')}`,
    )
  }
})

test('the front page takes its entity count from the stats response', () => {
  const source = code(read(FETCHER))

  // The count has to come from somewhere; pinning the ban alone would pass
  // if the figure were simply dropped and the page rendered a zero.
  assert.match(
    source,
    /entityCount\.value\s*=\s*stats\.total_entities/,
    'the entity count must be read from stats.json',
  )
  assert.match(
    source,
    /fetch\(\s*['"`]\/api\/v1\/stats\.json['"`]\s*\)/,
    'stats.json must still be fetched',
  )
})

test('the front page requests stats.json exactly once, across both files', () => {
  // Counted across the hero AND the page, because that is where the duplicate
  // actually lived: each file referenced stats.json once, so a per-file count
  // saw nothing wrong while the browser issued two identical requests.
  const source = [HERO, HOME].map((f) => code(read(f))).join('\n')
  const statsFetches = source.match(/stats\.json/g) || []

  assert.equal(
    statsFetches.length,
    1,
    'stats.json should be fetched once and both figures read from it',
  )
})
