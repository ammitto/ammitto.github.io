import test from 'node:test'
import assert from 'node:assert/strict'
import { gzipSync, gunzipSync } from 'node:zlib'
import { createHash, webcrypto } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import FlexSearch from 'flexsearch'
import { createSearchIndex, importSearchRuntime, SEARCH_RUNTIME_FORMAT, SEARCH_ENGINE_VERSION } from '../.test-build/utils/searchRuntime.js'
import { encodeSearchRuntimeBinary, SEARCH_RUNTIME_PARTITIONS } from '../.test-build/utils/searchRuntimeBinary.js'
import { indexableText } from '../.test-build/utils/searchEncode.js'
import { searchRowText } from '../.test-build/utils/birthAdapters.js'
import { searchIndexHarness, searchResponses } from '../scripts/search-index-harness.mjs'

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
const generated = '2026-01-01T00:00:00Z'
const sha = text => createHash('sha256').update(text).digest('hex')
const bytes = value => typeof value === 'string' ? new TextEncoder().encode(value).buffer : Uint8Array.from(value ?? []).buffer
const sourceDigest = input => sha(JSON.stringify([['cn', 'cn.json', sha(JSON.stringify({ entities: input }))]]))
const row = (id, name) => ({ id, ref: `cn/${id}`, type: 'person', names: [name], primaryName: name, authority: 'cn', status: 'active' })
const rows = [row('same', 'Oldword'), row('other', 'Newword'), row('same', 'Newword'), row('accent', 'Islámský stát'), row('ru', 'Скотт Моррисон')]

async function fixture(input = rows) {
  const ids = [...new Set(input.map(row => row.id))]
  const index = createSearchIndex()
  for (const entity of input) index.add(ids.indexOf(entity.id), indexableText(searchRowText(entity), entity.names))
  const parts = {}
  await index.export((key, text) => { parts[key] = JSON.parse(text) })
  const files = new Map()
  const groups = Array.from({ length: SEARCH_RUNTIME_PARTITIONS }, () => Array.from({ length: 9 }, () => Object.create(null)))
  parts.map.forEach((bucket, score) => {
    for (const [key, values] of Object.entries(bucket)) groups[key.charCodeAt(0) % SEARCH_RUNTIME_PARTITIONS][score][key] = values
  })
  const partitions = groups.map(maps => {
    if (maps.every(map => !Object.keys(map).length)) return null
    const raw = encodeSearchRuntimeBinary(maps, ids.length)
    const encoded = gzipSync(raw), hash = sha(encoded), file = `${hash}.bin`
    files.set(file, encoded)
    const seen = new Set(maps.flatMap(map => Object.values(map)).flat())
    return { file, sha256: hash, bytes: encoded.byteLength, decodedBytes: raw.byteLength, registeredCount: seen.size }
  })
  return { index, ids, files, manifest: { format: SEARCH_RUNTIME_FORMAT, engine: SEARCH_ENGINE_VERSION,
    generated, sourceDigest: sourceDigest(input), rowCount: input.length, entityCount: ids.length,
    registeredCount: Object.keys(parts.reg).length, bundles: ['composable.mjs'], cfg: parts.cfg, ctx: parts.ctx,
    partitions, partitionsDigest: sha(JSON.stringify(partitions)) } }
}
const firstPart = f => f.manifest.partitions['n'.charCodeAt(0) % SEARCH_RUNTIME_PARTITIONS]
function mutatePart(f, change) { change(firstPart(f)); f.manifest.partitionsDigest = sha(JSON.stringify(f.manifest.partitions)) }
function damageWire(f) {
  const descriptor = firstPart(f), raw = gunzipSync(f.files.get(descriptor.file))
  raw[0] = 0
  const encoded = gzipSync(raw), hash = sha(encoded)
  Object.assign(descriptor, { file: `${hash}.bin`, sha256: hash, bytes: encoded.byteLength })
  f.files.set(descriptor.file, encoded)
  f.manifest.partitionsDigest = sha(JSON.stringify(f.manifest.partitions))
}

const load = async f => {
  const loaded = await importSearchRuntime(f.manifest, rows, generated, 'composable.mjs', async file => bytes(f.files.get(file)), sourceDigest(rows))
  await loaded.prepare('Newword')
  return loaded
}

test('saved index retains duplicate replacement, ordering, accents, Cyrillic and absent constructor queries', async () => {
  const f = await fixture(), loaded = await load(f)
  assert.deepEqual(loaded.ids, f.ids)
  for (const query of ['newword', 'oldword', 'islamsky', 'скотт', 'constructor', 'missing']) {
    await loaded.prepare(query)
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
  digest: f => { f.manifest.sourceDigest = '0'.repeat(64) },
  rows: f => { f.manifest.rowCount++ },
  entities: f => { f.manifest.entityCount++ },
  configuration: f => { f.manifest.cfg.opt = 0 },
  context: f => { f.manifest.ctx = [{ constructor: [0] }] },
  traversal: f => mutatePart(f, p => { p.file = '../outside.bin' }),
  format: f => { f.manifest.format = 'ammitto-search-runtime/v2' },
  descriptor: f => { delete f.manifest.partitions },
  omitted: f => { f.manifest.partitions.splice(0, 1) },
  missingPartition: f => { f.manifest.partitions['n'.charCodeAt(0) % SEARCH_RUNTIME_PARTITIONS] = null },
  allNull: f => { f.manifest.partitions.fill(null); f.manifest.partitionsDigest = sha(JSON.stringify(f.manifest.partitions)) },
  checksum: f => mutatePart(f, p => { p.sha256 = '0'.repeat(64) }),
  oversized: f => mutatePart(f, p => { p.bytes = 64 * 1024 * 1024 + 1 }),
  inflated: f => mutatePart(f, p => { p.decodedBytes-- }),
  wire: f => damageWire(f),
  truncated: f => { f.files.set(firstPart(f).file, new Uint8Array(2)) },
  missing: f => { f.files.clear() },
  register: f => { f.manifest.registeredCount++ },
})) test(`rejects ${name} saved index before it becomes searchable`, async () => {
  const f = await fixture(); change(f)
  await assert.rejects(load(f))
})

const source = await readFile(new URL('../src/composables/useSearchIndex.ts', import.meta.url), 'utf8')
for (const corrupt of [false, true, 'omitted', 'wire', 'source', 'crypto', 'crypto-missing']) test(`real composable ${corrupt ? `falls back after damaged saved data (${corrupt})` : 'loads saved data without calling Index.add'}`, async () => {
  const f = await fixture()
  if (corrupt === 'wire') damageWire(f)
  const original = FlexSearch.Index.prototype.add
  const originalDigest = globalThis.crypto.subtle.digest
  if (String(corrupt).startsWith('crypto')) globalThis.crypto.subtle.digest = async () => { throw new Error('digest failed') }
  let adds = 0
  FlexSearch.Index.prototype.add = function (...args) { adds++; return original.apply(this, args) }
  try {
    await searchIndexHarness(source, async api => {
      const sourceRows = corrupt === 'source' ? rows.map(row => ({ ...row, country: 'CHANGED' })) : rows
      const base = searchResponses(sourceRows)
      globalThis.fetch = async url => {
        if (String(url).endsWith('/search-runtime/index.json')) return { ok: corrupt !== 'crypto-missing', json: async () => corrupt === 'omitted'
          ? { ...f.manifest, partitions: undefined } : f.manifest }
        if (String(url).includes('/search-runtime/')) return { ok: true, arrayBuffer: async () => bytes(corrupt === true ? '{}' : f.files.get(String(url).split('/').at(-1))) }
        return base(url)
      }
      await api.loadSearchIndex()
      assert.equal(api.isLoaded.value, true)
      assert.equal(api.error.value, null)
      await api.prepareSearch('Newword')
      assert.deepEqual(api.search('Newword').map(row => row.id), ['other', 'same'])
      await api.prepareSearch('constructor')
      assert.deepEqual(api.search('constructor'), [])
      assert.deepEqual(api.search('', 2).map(row => row.id), ['same', 'other'])
      assert.equal(api.entities.value.size, 4)
      assert.equal(api.getEntity('ru').primaryName, 'Скотт Моррисон')
    })
    // Updating a repeated ID can call add internally as well as the row replay.
    if (corrupt) assert.ok(adds >= rows.length)
    else assert.equal(adds, 0)
  } finally {
    FlexSearch.Index.prototype.add = original
    globalThis.crypto.subtle.digest = originalDigest
  }
})

test('blank browsing fetches no partitions; concurrent same-query preparation shares one download', async () => {
  const f = await fixture()
  let calls = 0, release
  const gate = new Promise(resolve => { release = resolve })
  const runtime = await importSearchRuntime(f.manifest, rows, generated, 'composable.mjs', async file => {
    calls++; await gate; return bytes(f.files.get(file))
  }, sourceDigest(rows))
  assert.equal(runtime.ready(''), true)
  assert.equal(runtime.ready('Newword'), false)
  await runtime.prepare('')
  assert.equal(calls, 0)
  const first = runtime.prepare('Newword'), second = runtime.prepare('Newword')
  assert.equal(calls, 1)
  release()
  await Promise.all([first, second])
  assert.equal(runtime.ready('Newword'), true)
  await runtime.prepare('Newword')
  assert.equal(calls, 1)
  assert.deepEqual(runtime.index.search('Newword').map(id => runtime.ids[id]), ['other', 'same'])
})

test('older query completion cannot clear loading for the latest pending query', async () => {
  const f = await fixture()
  let releaseFirst, releaseSecond
  const firstGate = new Promise(resolve => { releaseFirst = resolve })
  const secondGate = new Promise(resolve => { releaseSecond = resolve })
  const firstFile = firstPart(f).file
  const secondFile = f.manifest.partitions['с'.charCodeAt(0) % SEARCH_RUNTIME_PARTITIONS].file
  await searchIndexHarness(source, async api => {
    const base = searchResponses(rows)
    globalThis.fetch = async url => {
      if (String(url).endsWith('/search-runtime/index.json')) return { ok: true, json: async () => f.manifest }
      if (String(url).includes('/search-runtime/')) return { ok: true, arrayBuffer: async () => {
        const file = String(url).split('/').at(-1)
        if (file === firstFile) await firstGate
        if (file === secondFile) await secondGate
        return bytes(f.files.get(file))
      } }
      return base(url)
    }
    await api.loadSearchIndex()
    const first = api.prepareSearch('Newword')
    const second = api.prepareSearch('скотт')
    assert.equal(api.isQueryLoading.value, true)
    assert.deepEqual(api.search('скотт'), [])
    releaseFirst(); await first
    assert.equal(api.isQueryLoading.value, true)
    releaseSecond(); await second
    assert.equal(api.isQueryLoading.value, false)
    assert.deepEqual(api.search('скотт').map(entity => entity.id), ['ru'])
    assert.deepEqual(api.search('Newword').map(entity => entity.id), ['other', 'same'])
  })
})

test('fallback after a source refresh invalidates old entities and suggestion caches', async () => {
  const initial = [row('one', 'Alpha')], refreshed = [row('two', 'Beta')]
  const f = await fixture(initial)
  let loads = 0
  await searchIndexHarness(source, async api => {
    globalThis.fetch = async url => {
      if (String(url).endsWith('/search-runtime/index.json')) return { ok: true, json: async () => f.manifest }
      if (String(url).includes('/search-runtime/')) return { ok: false }
      if (String(url).endsWith('manifest.json')) loads++
      return searchResponses(loads > 1 ? refreshed : initial)(url)
    }
    await api.loadSearchIndex()
    assert.deepEqual(api.suggestFor('Alphx').map(match => match.token), ['alpha'])
    await api.prepareSearch('constructor')
    assert.equal(api.isLoaded.value, true)
    assert.equal(api.isQueryLoading.value, false)
    assert.equal(api.getEntity('one'), undefined)
    assert.equal(api.getEntity('two').primaryName, 'Beta')
    assert.deepEqual(api.suggestFor('Alphx'), [])
    assert.deepEqual(api.suggestFor('Betx').map(match => match.token), ['beta'])
  })
})

test('changing a pending query to blank clears busy state without reviving it on completion', async () => {
  const f = await fixture()
  let release
  const gate = new Promise(resolve => { release = resolve })
  await searchIndexHarness(source, async api => {
    const base = searchResponses(rows)
    globalThis.fetch = async url => {
      if (String(url).endsWith('/search-runtime/index.json')) return { ok: true, json: async () => f.manifest }
      if (String(url).includes('/search-runtime/')) return { ok: true, arrayBuffer: async () => {
        await gate; return bytes(f.files.get(String(url).split('/').at(-1)))
      } }
      return base(url)
    }
    await api.loadSearchIndex()
    const pending = api.prepareSearch('Newword')
    assert.equal(api.isQueryLoading.value, true)
    await api.prepareSearch('')
    assert.equal(api.isQueryLoading.value, false)
    assert.deepEqual(api.search('', 2).map(entity => entity.id), ['same', 'other'])
    release(); await pending
    assert.equal(api.isQueryLoading.value, false)
  })
})

test('simultaneous partition failures trigger one complete fallback build', async () => {
  const f = await fixture()
  let release, sourceLoads = 0
  const gate = new Promise(resolve => { release = resolve })
  await searchIndexHarness(source, async api => {
    const base = searchResponses(rows)
    globalThis.fetch = async url => {
      if (String(url).endsWith('/search-runtime/index.json')) return { ok: true, json: async () => f.manifest }
      if (String(url).includes('/search-runtime/')) { await gate; return { ok: false } }
      if (String(url).endsWith('/search-index/manifest.json')) sourceLoads++
      return base(url)
    }
    await api.loadSearchIndex()
    const first = api.prepareSearch('Newword'), second = api.prepareSearch('скотт')
    release(); await Promise.all([first, second])
    assert.equal(sourceLoads, 2, 'one initial API load and one fallback, not one rebuild per failed query')
    assert.equal(api.isLoaded.value, true)
    assert.equal(api.isQueryLoading.value, false)
    assert.equal(api.error.value, null)
    assert.deepEqual(api.search('Newword').map(entity => entity.id), ['other', 'same'])
    assert.deepEqual(api.search('скотт').map(entity => entity.id), ['ru'])
  })
})

test('partition fallback exposes progressive matches while the original index rebuilds', async () => {
  const input = Array.from({ length: 192 }, (_, id) => row(String(id), 'Shared'))
  const f = await fixture(input)
  await searchIndexHarness(source, async api => {
    const base = searchResponses(input)
    globalThis.fetch = async url => {
      if (String(url).endsWith('/search-runtime/index.json')) return { ok: true, json: async () => f.manifest }
      if (String(url).includes('/search-runtime/')) return { ok: false }
      return base(url)
    }
    await api.loadSearchIndex()
    const originalNow = performance.now
    let clock = 0, timer, pending
    Object.defineProperty(performance, 'now', { value: () => { clock += 100; return clock }, configurable: true })
    try {
      pending = api.prepareSearch('Shared')
      await new Promise((resolve, reject) => {
        const deadline = Date.now() + 5000
        const observe = () => {
          if (!api.isLoaded.value && api.indexedCount.value > 0) return resolve()
          if (Date.now() > deadline) return reject(new Error('No fallback indexing step observed'))
          timer = setTimeout(observe, 0)
        }
        observe()
      })
      assert.equal(api.isLoading.value, true)
      assert.equal(api.isQueryLoading.value, false, 'query download must yield ownership to progressive rebuild state')
      assert.ok(api.searchPartial('Shared', 1000).length > 0)
    } finally {
      clearTimeout(timer)
      await pending
      Object.defineProperty(performance, 'now', { value: originalNow, configurable: true })
    }
    assert.equal(api.search('Shared', 1000).length, input.length)
  })
})
