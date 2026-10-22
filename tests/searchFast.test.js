import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, webcrypto } from 'node:crypto'
import {
  FAST_FILTER_FIELDS, FAST_ROW_CHUNK, fastDocuments, encodeFastColumns, decodeFastColumns, fastFilterFields,
  validateFastManifest, decodeFastIds, decodeFastRows, fastResults,
} from '../.test-build/utils/searchFast.js'
import { fetchVerifiedAsset, pruneSearchAssets, searchAssetKey, SEARCH_ASSET_CACHE } from '../.test-build/utils/searchAssetCache.js'
import { filterSearchEntities } from '../.test-build/utils/searchFilters.js'

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
const sha = bytes => createHash('sha256').update(Buffer.from(bytes)).digest('hex')
const buffer = text => new TextEncoder().encode(text).buffer

const rows = [
  { id: 'a', ref: 'eu/a', type: 'person', names: ['A'], authority: 'eu', status: 'active', listType: 'sanctions', country: 'RU' },
  { id: 'b', ref: 'un/b', type: 'organization', names: ['B'], authority: 'un', regime: 'DPRK' },
  { id: 'a', ref: 'eu/a2', type: 'vessel', names: ['A2'], authority: 'uk', status: 'delisted', listType: 'unknown' },
  { id: 'c', ref: 'us/c', type: 'person', names: [], authority: '', status: 'active', listType: 'sanctions' },
]

test('documents keep the first position of a repeated id and the last row content (Map.set order)', () => {
  const docs = fastDocuments(rows)
  const expected = new Map()
  for (const row of rows) expected.set(row.id, row)
  assert.deepEqual(docs, [...expected.values()])
  assert.equal(docs[0].ref, 'eu/a2')
})

test('filter columns reproduce filterSearchEntities exactly, including absent and empty values', () => {
  const docs = fastDocuments(rows)
  const columns = decodeFastColumns(JSON.parse(JSON.stringify(encodeFastColumns(docs))), docs.length)
  const factory = fastResults(docs.map(doc => doc.id), columns)
  const stubs = docs.map((_, index) => factory.at(index))
  assert.equal(factory.at(1), stubs[1], 'one stable object per doc')
  assert.equal(factory.indexOf(stubs[2]), 2)
  assert.equal(factory.indexOf(docs[2]), undefined)
  for (const [index, doc] of docs.entries()) {
    assert.deepEqual(fastFilterFields(columns, index), Object.fromEntries(FAST_FILTER_FIELDS
      .filter(field => doc[field] !== undefined).map(field => [field, doc[field]])))
    for (const field of FAST_FILTER_FIELDS) assert.equal(stubs[index][field], doc[field])
    assert.equal(stubs[index].id, doc.id)
  }
  const values = field => [...new Set(rows.map(row => row[field]).filter(v => v !== undefined)), 'missing']
  const selections = [{}]
  for (const [family, field] of [['authorities', 'authority'], ['types', 'type'], ['regimes', 'regime'],
    ['statuses', 'status'], ['countries', 'country'], ['listTypes', 'listType']]) {
    for (const value of values(field)) selections.push({ [family]: [value] }, { [family]: [value], authorities: ['eu', 'uk'] })
  }
  for (const selection of selections) {
    assert.deepEqual(filterSearchEntities(stubs, selection).map(e => e.id),
      filterSearchEntities(docs, selection).map(e => e.id), JSON.stringify(selection))
  }
  assert.deepEqual([...FAST_FILTER_FIELDS].sort(), ['authority', 'country', 'listType', 'regime', 'status', 'type'])
})

test('a non-string filter value disables the fast assets instead of guessing', () => {
  assert.equal(encodeFastColumns([{ id: 'x', type: 'person', status: 3 }]), null)
})

test('tampered columns, ids and rows are rejected', () => {
  const docs = fastDocuments(rows)
  const good = encodeFastColumns(docs)
  const clone = () => JSON.parse(JSON.stringify(good))
  const outOfRange = clone(); outOfRange.codes.type[0] = 99
  const short = clone(); short.codes.status.pop()
  const duplicateDict = clone(); duplicateDict.dict.type.push('person')
  const missingField = clone(); delete missingField.codes.listType
  for (const bad of [outOfRange, short, duplicateDict, missingField, null, []]) {
    assert.throws(() => decodeFastColumns(bad, docs.length), /Incompatible/)
  }
  assert.throws(() => decodeFastIds(['a', 'a'], 2), /Incompatible/)
  assert.throws(() => decodeFastIds(['a'], 2), /Incompatible/)
  assert.deepEqual(decodeFastIds(['a', 'b'], 2), ['a', 'b'])
  const ids = docs.map(doc => doc.id)
  assert.deepEqual(decodeFastRows(docs, ids, 0), docs)
  assert.throws(() => decodeFastRows([docs[1], docs[0], docs[2]], ids, 0), /Incompatible/)
  assert.throws(() => decodeFastRows(docs.slice(1), ids, 0), /Incompatible/)
  assert.throws(() => decodeFastRows(docs, ids, 1), /Incompatible/)
})

test('fast manifest validation rejects addresses that do not match, wrong chunk counts and bad sources', () => {
  const asset = { file: `${'a'.repeat(64)}.bin`, sha256: 'a'.repeat(64), bytes: 10, decodedBytes: 20 }
  const source = { code: 'eu', file: 'eu.json', count: 3, sha256: 'b'.repeat(64), bytes: 100 }
  const manifest = { rowChunk: FAST_ROW_CHUNK, ids: asset, columns: asset, rows: [asset, asset], sources: [source] }
  assert.equal(validateFastManifest(manifest, FAST_ROW_CHUNK + 1), manifest)
  const variants = [
    { ...manifest, rows: [asset] },
    { ...manifest, rowChunk: 64 },
    { ...manifest, ids: { ...asset, file: `${'c'.repeat(64)}.bin` } },
    { ...manifest, columns: { ...asset, bytes: 0 } },
    { ...manifest, sources: [] },
    { ...manifest, sources: [{ ...source, file: '../x.json' }] },
    { ...manifest, sources: [{ ...source, bytes: undefined }] },
  ]
  for (const variant of variants) assert.throws(() => validateFastManifest(variant, FAST_ROW_CHUNK + 1), /Incompatible/)
})

function memoryStore({ failOpen = false, failPut = false } = {}) {
  const entries = new Map()
  return {
    entries,
    async open(name) {
      assert.equal(name, SEARCH_ASSET_CACHE)
      if (failOpen) throw new Error('SecurityError')
      return {
        async match(key) { const body = entries.get(key); return body && { arrayBuffer: async () => body.slice(0) } },
        async put(key, response) { if (failPut) throw new Error('QuotaExceededError'); entries.set(key, await response.arrayBuffer()) },
        async delete(key) { return entries.delete(key) },
        async keys() { return [...entries.keys()].map(url => ({ url })) },
      }
    },
  }
}
const settle = () => new Promise(resolve => setTimeout(resolve, 20))

test('verified cache: miss fetches and stores; hit skips the network; content address isolates builds', async () => {
  const body = buffer('partition-bytes')
  const digest = sha(body)
  const store = memoryStore()
  let calls = 0
  const network = async () => { calls++; return body.slice(0) }
  assert.equal(Buffer.from(await fetchVerifiedAsset('/r/x.bin', digest, body.byteLength, network, store)).toString(), 'partition-bytes')
  await settle()
  assert.equal(calls, 1)
  assert.ok(store.entries.has(searchAssetKey('/r/x.bin', digest)))
  await fetchVerifiedAsset('/r/x.bin', digest, body.byteLength, network, store)
  assert.equal(calls, 1, 'a verified cached copy answers without the network')
  // A new build (new address) never matches the old entry.
  const next = buffer('new-build-bytes')
  await fetchVerifiedAsset('/r/x.bin', sha(next), next.byteLength, async () => { calls++; return next.slice(0) }, store)
  assert.equal(calls, 2)
})

test('verified cache: a corrupted or truncated entry is discarded and refetched', async () => {
  const body = buffer('good-bytes')
  const digest = sha(body)
  for (const damaged of [buffer('evil-bytes'), buffer('good')]) {
    const store = memoryStore()
    store.entries.set(searchAssetKey('/r/y.bin', digest), damaged)
    let calls = 0
    const result = await fetchVerifiedAsset('/r/y.bin', digest, body.byteLength, async () => { calls++; return body.slice(0) }, store)
    assert.equal(Buffer.from(result).toString(), 'good-bytes')
    assert.equal(calls, 1)
    await settle()
    assert.equal(Buffer.from(store.entries.get(searchAssetKey('/r/y.bin', digest))).toString(), 'good-bytes')
  }
})

test('verified cache: a tampered or wrong-size network copy throws and is never stored', async () => {
  const body = buffer('expected')
  const store = memoryStore()
  await assert.rejects(fetchVerifiedAsset('/r/z.bin', sha(body), body.byteLength, async () => buffer('tampered'), store), /verification/)
  await assert.rejects(fetchVerifiedAsset('/r/z.bin', sha(body), body.byteLength + 1, async () => body.slice(0), store), /verification/)
  await settle()
  assert.equal(store.entries.size, 0)
})

test('verified cache: unavailable storage, quota and eviction failures degrade silently to the network', async () => {
  const body = buffer('bytes')
  const digest = sha(body)
  for (const store of [null, memoryStore({ failOpen: true }), memoryStore({ failPut: true })]) {
    let calls = 0
    const result = await fetchVerifiedAsset('/r/q.bin', digest, body.byteLength, async () => { calls++; return body.slice(0) }, store)
    assert.equal(Buffer.from(result).toString(), 'bytes')
    assert.equal(calls, 1)
  }
  await settle()
  assert.equal(await pruneSearchAssets(new Set(), memoryStore({ failOpen: true })), 0)
})

test('prune removes only entries the current manifest does not reference', async () => {
  const store = memoryStore()
  store.entries.set('k1', buffer('1'))
  store.entries.set('k2', buffer('2'))
  assert.equal(await pruneSearchAssets(new Set(['k1']), store), 1)
  assert.deepEqual([...store.entries.keys()], ['k1'])
})
