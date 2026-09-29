/**
 * Which API data `npm run dev` serves.
 *
 * The committed public/api/v1 is a small CI sample, and a data-cn checkout
 * copied over it covers CN only. The failure this guards against is silent:
 * a developer browses an incomplete tree and pages needing a missing file
 * just fail. Equally, an unattended run must never hang on a prompt or reach
 * the network unless asked, which is why the non-terminal default is sample.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  REQUIRED_STATIC, TEMPLATED_PATHS, decideDevData, parsePromptAnswer, requiredApiFiles,
} from '../scripts/dev-data-mode.js'
import { fetchableSources } from '../.test-build/utils/sourceCatalog.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOME = ['sources/au.jsonld']
const NONE = []

test('the index files the browse pages load are required', () => {
  const files = requiredApiFiles(['eu', 'cn'])
  for (const f of [
    'search-index/manifest.json', 'stats.json', 'facets/types.json',
    'node/legal-instrument/index.jsonld', 'node/group/index.jsonld',
    'node/organization/index.jsonld', 'node/document-type/index.jsonld',
    'sources/eu.jsonld', 'sources/cn.jsonld',
  ]) assert.ok(files.includes(f), f)
})

// The list above is only as good as its coverage of what src/ requests, so
// every api/v1 path literal in src/ is found here and must be accounted for.
// An interpolation becomes `*`. DownloadPage names paths off an API_BASE that
// already ends in api/v1, so `${API_BASE}/x` counts there. These are text
// checks over source, not a trace of what runs; see birthWiring.test.js.
// A path with no recognisable api/v1 literal anywhere (assembled from
// fragments at run time) is invisible here, so a fetch written like that
// must be added to the lists by hand.
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const full = join(dir, name)
  if (statSync(full).isDirectory()) return walk(full)
  return /\.(ts|vue)$/.test(name) ? [full] : []
})
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1 ')

function apiPathPatterns() {
  const found = new Map()
  for (const file of walk(join(repoRoot, 'src'))) {
    const source = stripComments(readFileSync(file, 'utf8'))
    const baseIsApi = /API_BASE\s*=\s*`[^`]*api\/v1`/.test(source)
    for (const m of source.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*?)\1/g)) {
      const literal = m[2]
      const at = literal.indexOf('api/v1/')
      let rest
      if (at >= 0) rest = literal.slice(at + 'api/v1/'.length)
      else if (baseIsApi && literal.startsWith('${API_BASE}/')) rest = literal.slice('${API_BASE}/'.length)
      else continue
      const pattern = rest.replace(/\$\{[^}]*\}/g, '*')
      found.set(pattern, [...(found.get(pattern) ?? []), relative(repoRoot, file)])
    }
  }
  return found
}

test('every api/v1 path in src/ is required or exempted with a reason', () => {
  const found = apiPathPatterns()
  assert.ok(found.has('node/legal-instrument/index.jsonld'), 'the scan must see BrowseLegalInstrumentsPage')
  for (const [pattern, files] of found) {
    assert.ok(
      REQUIRED_STATIC.includes(pattern) || pattern in TEMPLATED_PATHS,
      `api/v1/${pattern} (${files.join(', ')}) is neither in REQUIRED_STATIC nor TEMPLATED_PATHS`,
    )
  }
})

test('no required or exempted path is stale', () => {
  const found = apiPathPatterns()
  for (const pattern of [...REQUIRED_STATIC, ...Object.keys(TEMPLATED_PATHS)]) {
    assert.ok(found.has(pattern), `api/v1/${pattern} no longer appears in src/`)
  }
  for (const [pattern, reason] of Object.entries(TEMPLATED_PATHS)) {
    assert.ok(reason.length > 0, `${pattern} needs a reason`)
  }
})

test('a source the site does not fetch is not required', () => {
  const files = requiredApiFiles(fetchableSources())
  assert.ok(!files.includes('sources/ru.jsonld'))
  assert.ok(files.includes('sources/au.jsonld'))
})

test('a CN-only tree (search index and stats alone) is incomplete', () => {
  const present = new Set(['search-index/manifest.json', 'search-index/cn.json', 'stats.json', 'sources/cn.jsonld'])
  const missing = requiredApiFiles(fetchableSources()).filter((f) => !present.has(f))
  assert.ok(missing.length > 0)
  assert.deepEqual(decideDevData({ isTTY: true, envValue: undefined, missing }), { action: 'prompt' })
})

test('a terminal with an incomplete tree is asked', () => {
  assert.deepEqual(
    decideDevData({ isTTY: true, envValue: undefined, missing: SOME }),
    { action: 'prompt' },
  )
})

test('no terminal and no env var serves the local tree with a warning', () => {
  assert.deepEqual(
    decideDevData({ isTTY: false, envValue: undefined, missing: SOME }),
    { action: 'run', mode: 'sample', warn: true },
  )
})

test('an empty env var counts as unset', () => {
  assert.deepEqual(
    decideDevData({ isTTY: false, envValue: '', missing: SOME }),
    { action: 'run', mode: 'sample', warn: true },
  )
})

test('a complete tree runs without asking or warning, terminal or not', () => {
  for (const isTTY of [true, false]) {
    assert.deepEqual(
      decideDevData({ isTTY, envValue: undefined, missing: NONE }),
      { action: 'run', mode: 'sample', warn: false },
    )
  }
})

test('the env var wins over the prompt and over a complete tree', () => {
  for (const isTTY of [true, false]) {
    for (const missing of [SOME, NONE]) {
      assert.deepEqual(
        decideDevData({ isTTY, envValue: 'live', missing }),
        { action: 'run', mode: 'live', warn: false },
      )
    }
  }
  assert.deepEqual(
    decideDevData({ isTTY: true, envValue: ' Sample ', missing: SOME }),
    { action: 'run', mode: 'sample', warn: true },
  )
  assert.deepEqual(
    decideDevData({ isTTY: true, envValue: 'sample', missing: NONE }),
    { action: 'run', mode: 'sample', warn: false },
  )
})

test('an unknown env value is an error, not a silent default', () => {
  const result = decideDevData({ isTTY: false, envValue: 'full', missing: SOME })
  assert.equal(result.action, 'error')
  assert.match(result.message, /AMMITTO_DEV_DATA/)
})

test('prompt answers map to modes; an empty answer is live', () => {
  for (const a of ['', '  ', 'l', 'L', 'live', 'LIVE']) assert.equal(parsePromptAnswer(a), 'live')
  for (const a of ['s', 'S', 'sample']) assert.equal(parsePromptAnswer(a), 'sample')
  for (const a of ['q', 'Quit']) assert.equal(parsePromptAnswer(a), 'quit')
  for (const a of ['x', 'yes', 'lives']) assert.equal(parsePromptAnswer(a), null)
})
