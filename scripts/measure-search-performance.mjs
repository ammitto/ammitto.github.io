// Compare actual composable sources, including real Vue and FlexSearch.
// Synthetic CPU workload only: excludes HTTP, parsing and DOM/render time.
// Usage: node scripts/measure-search-performance.mjs /path/to/baseline.ts [rows] [runs]
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
import { searchIndexHarness, searchResponses } from './search-index-harness.mjs'

const syntheticRows = count => Array.from({ length: count }, (_, i) => ({
  id: `https://www.ammitto.org/entity/cn/p${i}`, ref: `cn/p${i}`, type: i % 3 ? 'person' : 'organization',
  names: [`Synthetic Person ${i}`], primaryName: `Synthetic Person ${i}`, authority: 'cn',
  country: i % 2 ? 'IRAN' : 'SYRIA', status: 'active',
}))

async function measure(sourcePath, count) {
  const source = await readFile(sourcePath, 'utf8')
  const rows = syntheticRows(count)
  let sample
  await searchIndexHarness(source, async api => {
    globalThis.fetch = searchResponses(rows)
    const started = performance.now()
    await api.loadSearchIndex()
    const loadMs = performance.now() - started
    assert.equal(api.error.value, null)
    assert.equal(api.entities.value.size, count)
    // Cold index loading is measured separately from repeated warm queries.
    // Warm the query and check every result position outside its timed phase.
    assert.deepEqual(api.search('Synthetic', count).map(row => row.id), rows.map(row => row.id))
    const queryStarted = performance.now()
    let signature = ''
    for (let query = 0; query < 20; query++) {
      const matches = api.search('Synthetic', count)
      assert.equal(matches.length, count)
      signature = `${matches[0].id}|${matches.at(-1).id}`
    }
    const queriesMs = performance.now() - queryStarted
    assert.equal(signature, `${rows[0].id}|${rows.at(-1).id}`)
    sample = { pid: process.pid, loadMs, queriesMs }
  })
  return sample
}

const sampleMode = process.argv[2] === '--sample'
const baselinePath = process.argv[sampleMode ? 3 : 2]
if (!baselinePath) throw new Error('Provide the baseline useSearchIndex.ts path')
const count = Number(process.argv[sampleMode ? 4 : 3] || 60000)
const runs = sampleMode ? 1 : Number(process.argv[4] || 5)
if (!Number.isInteger(count) || count < 1 || (!sampleMode && (!Number.isInteger(runs) || runs < 1))) throw new Error('Positive integer rows/runs required')

if (sampleMode) {
  console.log(JSON.stringify(await measure(baselinePath, count)))
} else {
  const paths = { baseline: baselinePath, candidate: fileURLToPath(new URL('../src/composables/useSearchIndex.ts', import.meta.url)) }
  const results = { baseline: [], candidate: [] }
  // Each sample gets a disposable process: imported ESM state cannot retain
  // prior indexes in later samples. Compilation/process startup is untimed.
  for (let run = 0; run < runs; run++) {
    for (const name of run % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) {
      const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--sample', paths[name], String(count)], {
        encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024,
      })
      if (child.error || child.status !== 0) throw new Error(`${name} sample failed: ${child.error?.message || child.stderr || child.status}`)
      results[name].push(JSON.parse(child.stdout))
    }
  }
  const median = values => {
    const sorted = [...values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
  }
  const summarize = values => Object.fromEntries(['loadMs', 'queriesMs'].map(key => [key, {
    median: median(values.map(value => value[key])), min: Math.min(...values.map(value => value[key])), max: Math.max(...values.map(value => value[key])),
  }]))
  const hashes = {}
  for (const [name, sourcePath] of Object.entries(paths)) hashes[name] = createHash('sha256').update(await readFile(sourcePath)).digest('hex')
  console.log(JSON.stringify({ scope: 'Synthetic Node composable CPU-only; cold index load and warm repeated queries; fresh process per sample; no network/DOM or production speed claim', node: process.version, nodeEnv: process.env.NODE_ENV || 'development', sourceHashes: hashes, rows: count, runs, queryWarmupCalls: 1, queriesPerSample: 20, results, summary: { baseline: summarize(results.baseline), candidate: summarize(results.candidate) } }, null, 2))
}
