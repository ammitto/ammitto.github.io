import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, webcrypto } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import FlexSearch from 'flexsearch'
import { createSearchIndex, importSearchRuntime, SEARCH_RUNTIME_FORMAT, SEARCH_ENGINE_VERSION } from '../.test-build/utils/searchRuntime.js'
import { indexableText } from '../.test-build/utils/searchEncode.js'
import { searchRowText } from '../.test-build/utils/birthAdapters.js'
import { searchIndexHarness, searchResponses } from '../scripts/search-index-harness.mjs'

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
const generated = '2026-01-01T00:00:00Z'
const sha = text => createHash('sha256').update(text).digest('hex')
const row = (id, name) => ({ id, ref: `cn/${id}`, type: 'person', names: [name], primaryName: name, authority: 'cn', status: 'active' })
const rows = [row('same', 'Oldword'), row('other', 'Newword'), row('same', 'Newword'), row('accent', 'Islámský stát'), row('ru', 'Скотт Моррисон')]

async function fixture(input = rows) {
  const ids = [...new Set(input.map(row => row.id))]
  const index = createSearchIndex()
  for (const entity of input) index.add(ids.indexOf(entity.id), indexableText(searchRowText(entity), entity.names))
  const parts = {}
  await index.export((key, text) => { parts[key] = JSON.parse(text) })
  const files = new Map()
  const chunks = []
  function chunk(kind, data, score) {
    if (!Object.keys(data).length) return
    const text = JSON.stringify(data), hash = sha(text), file = `${hash}.json`
    files.set(file, text)
    chunks.push({ file, sha256: hash, bytes: Buffer.byteLength(text), kind, ...(score === undefined ? {} : { score }) })
  }
  chunk('reg', parts.reg)
  parts.map.forEach((data, score) => chunk('map', data, score))
  return { index, ids, files, manifest: { format: SEARCH_RUNTIME_FORMAT, engine: SEARCH_ENGINE_VERSION,
    generated, rowsDigest: sha(JSON.stringify(input)), rowCount: input.length, entityCount: ids.length,
    registeredCount: Object.keys(parts.reg).length, bundles: ['composable.mjs'], cfg: parts.cfg, ctx: parts.ctx,
    chunksDigest: sha(JSON.stringify(chunks)), chunks } }
}

const load = f => importSearchRuntime(f.manifest, rows, generated, 'composable.mjs', async file => f.files.get(file))

test('saved index retains duplicate replacement, ordering, accents, Cyrillic and absent constructor queries', async () => {
  const f = await fixture(), loaded = await load(f)
  assert.deepEqual(loaded.ids, f.ids)
  for (const query of ['newword', 'oldword', 'islamsky', 'скотт', 'constructor', 'missing']) {
    assert.deepEqual(loaded.index.search(query, { limit: 100 }).map(id => loaded.ids[id]),
      f.index.search(query, { limit: 100 }).map(id => f.ids[id]))
  }
  assert.deepEqual(loaded.index.search('Newword').map(id => loaded.ids[id]), ['other', 'same'])
  assert.deepEqual(loaded.index.search('constructor'), [])
})

for (const [name, change] of Object.entries({
  stale: f => { f.manifest.generated = '2025-01-01' },
  engine: f => { f.manifest.engine = 'different' },
  bundle: f => { f.manifest.bundles = ['old.js'] },
  digest: f => { f.manifest.rowsDigest = '0'.repeat(64) },
  rows: f => { f.manifest.rowCount++ },
  entities: f => { f.manifest.entityCount++ },
  configuration: f => { f.manifest.cfg.opt = 0 },
  context: f => { f.manifest.ctx = [{ constructor: [0] }] },
  traversal: f => { f.manifest.chunks[0].file = '../outside.json' },
  duplicate: f => { f.manifest.chunks.push(f.manifest.chunks[0]) },
  omitted: f => { f.manifest.chunks = f.manifest.chunks.filter(c => c.kind === 'reg') },
  partial: f => { f.manifest.chunks.splice(f.manifest.chunks.findIndex(c => c.kind === 'map'), 1) },
  score: f => { const c = f.manifest.chunks.find(c => c.kind === 'map'); c.score = (c.score + 1) % 9 },
  truncated: f => { f.files.set(f.manifest.chunks[0].file, '{}') },
  missing: f => { f.files.clear() },
  register: f => { f.manifest.registeredCount++ },
  posting: f => {
    const c = f.manifest.chunks.find(c => c.kind === 'map')
    const data = JSON.parse(f.files.get(c.file)); data[Object.keys(data)[0]] = [99999]
    const text = JSON.stringify(data); c.sha256 = sha(text); c.file = `${c.sha256}.json`; c.bytes = Buffer.byteLength(text)
    f.files.set(c.file, text)
    f.manifest.chunksDigest = sha(JSON.stringify(f.manifest.chunks))
  },
})) test(`rejects ${name} saved index before it becomes searchable`, async () => {
  const f = await fixture(); change(f)
  await assert.rejects(load(f))
})

const source = await readFile(new URL('../src/composables/useSearchIndex.ts', import.meta.url), 'utf8')
for (const corrupt of [false, true, 'omitted']) test(`real composable ${corrupt ? `falls back after damaged saved data (${corrupt})` : 'loads saved data without calling Index.add'}`, async () => {
  const f = await fixture()
  const original = FlexSearch.Index.prototype.add
  let adds = 0
  FlexSearch.Index.prototype.add = function (...args) { adds++; return original.apply(this, args) }
  try {
    await searchIndexHarness(source, async api => {
      const base = searchResponses(rows)
      globalThis.fetch = async url => {
        if (String(url).endsWith('/search-runtime/index.json')) return { ok: true, json: async () => corrupt === 'omitted'
          ? { ...f.manifest, chunks: f.manifest.chunks.filter(c => c.kind === 'reg') } : f.manifest }
        if (String(url).includes('/search-runtime/')) return { ok: true, text: async () => corrupt === true ? '{}' : f.files.get(String(url).split('/').at(-1)) }
        return base(url)
      }
      await api.loadSearchIndex()
      assert.equal(api.isLoaded.value, true)
      assert.equal(api.error.value, null)
      assert.deepEqual(api.search('Newword').map(row => row.id), ['other', 'same'])
      assert.deepEqual(api.search('constructor'), [])
      assert.deepEqual(api.search('', 2).map(row => row.id), ['same', 'other'])
      assert.equal(api.entities.value.size, 4)
      assert.equal(api.getEntity('ru').primaryName, 'Скотт Моррисон')
    })
    // Updating a repeated ID can call add internally as well as the row replay.
    if (corrupt) assert.ok(adds >= rows.length)
    else assert.equal(adds, 0)
  } finally { FlexSearch.Index.prototype.add = original }
})
