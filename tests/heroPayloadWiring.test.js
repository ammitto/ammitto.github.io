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

/** Strip comments, so the prose explaining the ban does not satisfy it. */
const code = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/<!--[\s\S]*?-->/g, ' ')

test('the hero does not fetch the search index', () => {
  const source = code(read(HERO))

  assert.ok(
    !/search-index/.test(source),
    'HeroSection must not reference search-index.json: it is the entire ' +
      'corpus, and the front page needs one integer from it',
  )
})

test('the hero takes its entity count from the stats response', () => {
  const source = code(read(HERO))

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

test('the hero reads both figures from one stats response', () => {
  const source = code(read(HERO))

  // Two fetches of the same URL would pass the checks above while
  // reintroducing a needless request.
  const statsFetches = source.match(/stats\.json/g) || []

  assert.equal(
    statsFetches.length,
    1,
    'stats.json should be fetched once and both figures read from it',
  )
})
