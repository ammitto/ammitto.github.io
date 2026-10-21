import test from 'node:test'
import assert from 'node:assert/strict'
import FlexSearch from 'flexsearch'
import {
  encodeSearchRuntimeBinary, decodeSearchRuntimeBinary,
  SEARCH_BINARY_MAX_BYTES, SEARCH_BINARY_MAX_ENTITIES, SEARCH_BINARY_CACHE_TERMS, SEARCH_BINARY_CACHE_IDS, SEARCH_RUNTIME_PARTITIONS,
} from '../.test-build/utils/searchRuntimeBinary.js'
import { foldForSearch } from '../.test-build/utils/searchEncode.js'

const emptyMaps = () => Array.from({ length: 9 }, () => Object.create(null))
const buffer = bytes => Uint8Array.from(bytes).buffer
const put = (bytes, word, value) => new DataView(bytes.buffer).setUint32(8 + word * 4, value, true)
const tableStart = bytes => 64 + Math.ceil(new DataView(bytes.buffer).getUint32(8, true) / 4) * 4

// Independent literal wire fixture: a=[2,0,2,2], constructor=[], score1 a=[1],
// score8 lone-surrogate=[0,2]. Signed zigzags are [4,3,4,0,2,0,4].
function wire(terms = ['a', 'constructor', '\ud800']) {
  const dictionary = new TextEncoder().encode(JSON.stringify(terms))
  const start = 64 + Math.ceil(dictionary.length / 4) * 4
  const bytes = new Uint8Array(start + 4 * 8 + 9 * 4 + 7)
  bytes.set(new TextEncoder().encode('AMMITTO2'))
  ;[dictionary.length, 3, 3, 4, 7, 2, 1, 0, 0, 0, 0, 0, 0, 1].forEach((value, i) => put(bytes, i, value))
  bytes.set(dictionary, 64)
  const view = new DataView(bytes.buffer)
  let cursor = start
  for (const values of [[0, 1, 0, 4, 4], [0, 4, 5], [5], [5], [5], [5], [5], [5], [2, 5, 7]]) {
    for (const value of values) { view.setUint32(cursor, value, true); cursor += 4 }
  }
  bytes.set([4, 3, 4, 0, 2, 0, 4], cursor)
  return bytes
}

test('encoder matches a literal independent wire format and decoder preserves signed deltas and empty lists', async () => {
  const maps = emptyMaps()
  maps[0].a = [2, 0, 2, 2]
  maps[0].constructor = []
  maps[1].a = [1]
  maps[8]['\ud800'] = [0, 2]
  const bytes = encodeSearchRuntimeBinary(maps, 3)
  assert.deepEqual(bytes, wire())
  const decoded = await decodeSearchRuntimeBinary(buffer(wire()), 3, 3)
  assert.deepEqual(decoded.map[0].a, [2, 0, 2, 2])
  assert.deepEqual(decoded.map[0].constructor, [])
  assert.equal(decoded.map[1].constructor, undefined)
  assert.deepEqual(decoded.map[8]['\ud800'], [0, 2])
  assert.deepEqual({ ...decoded.register }, { 0: 1, 1: 1, 2: 1 })
  assert.equal(Object.getPrototypeOf(decoded.register), null)
  for (const bucket of decoded.map) assert.equal(Object.getPrototypeOf(bucket), null)
})

test('UTF-16 sorting, prototype keys and bounded FIFO caches retain normal array values', async () => {
  const maps = emptyMaps()
  for (const term of ['__proto__', 'constructor', 'toString', '\ud800', '\u{10000}', '\ue000']) maps[0][term] = [0]
  for (let i = 0; i <= SEARCH_BINARY_CACHE_TERMS; i++) maps[1][`term${i}`] = [0]
  const decoded = await decodeSearchRuntimeBinary(buffer(encodeSearchRuntimeBinary(maps, 1)), 1, 1)
  for (const term of Object.keys(maps[0])) assert.deepEqual(decoded.map[0][term], [0], JSON.stringify(term))
  assert.equal(decoded.map[2].constructor, undefined)
  assert.equal(decoded.map[2].__proto__, undefined)
  const first = decoded.map[1].term0
  assert.equal(decoded.map[1].term0, first)
  for (let i = 1; i <= SEARCH_BINARY_CACHE_TERMS; i++) void decoded.map[1][`term${i}`]
  assert.notEqual(decoded.map[1].term0, first)
  assert.deepEqual(decoded.map[1].term0, first)
  assert.ok(Array.isArray(first))
  assert.throws(() => { decoded.map[0].a = [0] }, /read-only/)
  assert.throws(() => { delete decoded.map[0].constructor }, /read-only/)
  assert.throws(() => Object.defineProperty(decoded.map[0], 'a', { value: [0] }), /read-only/)
  assert.throws(() => Object.setPrototypeOf(decoded.map[0], {}), /read-only/)
})

test('zero entities, no terms and empty posting entries round trip', async () => {
  for (const entities of [0, 1]) {
    const maps = emptyMaps()
    if (entities) maps[4].empty = []
    const decoded = await decodeSearchRuntimeBinary(buffer(encodeSearchRuntimeBinary(maps, entities)), entities, 0)
    assert.deepEqual(Object.keys(decoded.register), [])
    assert.equal(decoded.map[0].missing, undefined)
    if (entities) assert.deepEqual(decoded.map[4].empty, [])
  }
})

test('optional partition validation checks every first UTF-16 unit and rejects foreign terms', async () => {
  assert.equal(SEARCH_RUNTIME_PARTITIONS, 64)
  const maps = emptyMaps()
  maps[0].a = [0]
  maps[1]['á'] = [0]
  maps[8]['\ud861'] = []
  const bytes = encodeSearchRuntimeBinary(maps, 1)
  const decoded = await decodeSearchRuntimeBinary(buffer(bytes), 1, 1, 33)
  assert.deepEqual(decoded.map[8]['\ud861'], [])
  for (const partition of [-1, 0, 32, 34, 64, NaN, 0.5]) await assert.rejects(decodeSearchRuntimeBinary(buffer(bytes), 1, 1, partition))
  maps[8]['\ud800'] = []
  await assert.rejects(decodeSearchRuntimeBinary(buffer(encodeSearchRuntimeBinary(maps, 1)), 1, 1, 33))
})

test('partition mode rejects empty terms while unpartitioned codec keeps their existing semantics', async () => {
  const maps = emptyMaps(); maps[0][''] = [0]
  const bytes = encodeSearchRuntimeBinary(maps, 1)
  const decoded = await decodeSearchRuntimeBinary(buffer(bytes), 1, 1)
  assert.deepEqual(decoded.map[0][''], [0])
  await assert.rejects(decodeSearchRuntimeBinary(buffer(bytes), 1, 1, 0))
})

test('private validated bytes and frozen posting arrays survive caller mutation and detachment', async () => {
  const input = buffer(wire())
  const decoded = await decodeSearchRuntimeBinary(input, 3, 3)
  new Uint8Array(input).fill(255)
  structuredClone(input, { transfer: [input] })
  assert.equal(input.byteLength, 0)
  assert.deepEqual(decoded.map[0].a, [2, 0, 2, 2])
  assert.throws(() => { decoded.map[0].a[0] = 0 }, TypeError)
  assert.throws(() => decoded.map[0].a.push(0), TypeError)
  assert.equal(Object.isFrozen(decoded.map[0].constructor), true)
})

test('FIFO cache bounds total decoded IDs and does not retain an oversized posting list', async () => {
  const maps = emptyMaps()
  const size = SEARCH_BINARY_CACHE_IDS / 2 + 1
  maps[0].first = Array(size).fill(0)
  maps[0].second = Array(size).fill(0)
  maps[0].oversized = Array(SEARCH_BINARY_CACHE_IDS + 1).fill(0)
  const decoded = await decodeSearchRuntimeBinary(buffer(encodeSearchRuntimeBinary(maps, 1)), 1, 1)
  const first = decoded.map[0].first
  assert.equal(decoded.map[0].first, first)
  const second = decoded.map[0].second
  assert.equal(decoded.map[0].second, second)
  assert.notEqual(decoded.map[0].first, first)
  assert.notEqual(decoded.map[0].oversized, decoded.map[0].oversized)
})

test('large positive and negative IDs use canonical multibyte deltas without sorting', async () => {
  const maps = emptyMaps()
  maps[0].a = [SEARCH_BINARY_MAX_ENTITIES - 1, 0, 128, 128, 16384]
  const decoded = await decodeSearchRuntimeBinary(buffer(encodeSearchRuntimeBinary(maps, SEARCH_BINARY_MAX_ENTITIES)), SEARCH_BINARY_MAX_ENTITIES, 4)
  assert.deepEqual(decoded.map[0].a, maps[0].a)
})

test('actual FlexSearch export/import preserves query results and duplicate update order', async () => {
  const original = new FlexSearch.Index({ tokenize: 'forward', cache: true, encode: foldForSearch })
  for (const [id, text] of [[0, 'Shared Oldword'], [1, 'Shared'], [0, 'Shared'], [2, 'Islámský stát'], [3, 'Иван'], [4, 'Constructor']]) original.add(id, text)
  const parts = {}
  await original.export((key, text) => { parts[key] = JSON.parse(text) })
  const decoded = await decodeSearchRuntimeBinary(buffer(encodeSearchRuntimeBinary(parts.map, 5)), 5, Object.keys(parts.reg).length)
  const imported = new FlexSearch.Index({ tokenize: 'forward', cache: true, encode: foldForSearch })
  for (const [key, data] of Object.entries({ ...parts, map: decoded.map, reg: decoded.register })) imported.import(key, data)
  for (const query of ['shared', 'oldword', 'shared oldword', 'islamsky', 'stát', 'islamsky stát', 'иван', 'constructor', '__proto__', 'constructor absent', 'missing']) {
    assert.deepEqual(imported.search(query, { limit: 100 }), original.search(query, { limit: 100 }), query)
  }
  assert.deepEqual(imported.search('shared'), [1, 0])
})

for (const [name, mutate] of Object.entries({
  magic: bytes => { bytes[0] = 0 },
  entities: bytes => put(bytes, 2, 4),
  sum: bytes => put(bytes, 3, 5),
  dictionaryCount: bytes => put(bytes, 1, 2),
  dictionaryOverflow: bytes => put(bytes, 0, 0xffffffff),
  postingLength: bytes => put(bytes, 4, 8),
  bucketOverflow: bytes => put(bytes, 5, 0xffffffff),
  termID: bytes => { new DataView(bytes.buffer).setUint32(tableStart(bytes), 3, true) },
  duplicateTermID: bytes => { new DataView(bytes.buffer).setUint32(tableStart(bytes) + 4, 0, true) },
  firstOffset: bytes => { new DataView(bytes.buffer).setUint32(tableStart(bytes) + 8, 1, true) },
  backwardOffset: bytes => { new DataView(bytes.buffer).setUint32(tableStart(bytes) + 16, 3, true) },
  beyondOffset: bytes => { new DataView(bytes.buffer).setUint32(tableStart(bytes) + 12, 8, true) },
  gap: bytes => { new DataView(bytes.buffer).setUint32(tableStart(bytes) + 24, 5, true) },
  unterminated: bytes => { bytes[bytes.length - 1] = 128 },
  negativeID: bytes => { bytes[bytes.length - 2] = 1 },
  largeID: bytes => { bytes[bytes.length - 1] = 100 },
  noncanonical: bytes => { bytes[bytes.length - 2] = 128; bytes[bytes.length - 1] = 0 },
  tooManyVarintBytes: bytes => { bytes.fill(128, bytes.length - 7, bytes.length - 3) },
  overflowVarint: bytes => { bytes.set([255, 255, 255, 127], bytes.length - 7) },
})) test(`rejects ${name} wire corruption before returning a searchable map`, async () => {
  const bytes = wire(); mutate(bytes)
  await assert.rejects(decodeSearchRuntimeBinary(buffer(bytes), 3, 3))
})

test('rejects unsorted, duplicate or non-string dictionary terms', async () => {
  for (const terms of [['z', 'a', '\ud800'], ['a', 'a', '\ud800'], ['a', 123, '\ud800']]) {
    await assert.rejects(decodeSearchRuntimeBinary(buffer(wire(terms)), 3, 3))
  }
})

test('rejects truncated/trailing bytes, register disagreement and invalid size/count arguments', async () => {
  const bytes = wire()
  for (const end of [0, 7, 63, bytes.length - 1]) await assert.rejects(decodeSearchRuntimeBinary(buffer(bytes.subarray(0, end)), 3, 3))
  const extra = new Uint8Array(bytes.length + 1); extra.set(bytes)
  await assert.rejects(decodeSearchRuntimeBinary(extra.buffer, 3, 3))
  await assert.rejects(decodeSearchRuntimeBinary(buffer(bytes), 3, 2))
  await assert.rejects(decodeSearchRuntimeBinary(buffer(bytes), 3, 4))
  await assert.rejects(decodeSearchRuntimeBinary(buffer(bytes), SEARCH_BINARY_MAX_ENTITIES + 1, 3))
  await assert.rejects(decodeSearchRuntimeBinary(new ArrayBuffer(SEARCH_BINARY_MAX_BYTES + 1), 0, 0))
  for (const entities of [-1, 0.1, NaN, SEARCH_BINARY_MAX_ENTITIES + 1]) assert.throws(() => encodeSearchRuntimeBinary(emptyMaps(), entities))
  const maps = emptyMaps(); maps[0].bad = [-1]
  assert.throws(() => encodeSearchRuntimeBinary(maps, 3))
  maps[0].bad = [3]
  assert.throws(() => encodeSearchRuntimeBinary(maps, 3))
  assert.throws(() => encodeSearchRuntimeBinary([], 0))
})

test('validation yields inside one long posting list before publishing', async () => {
  const maps = emptyMaps()
  maps[0].long = Array.from({ length: 5000 }, (_, id) => id)
  const bytes = encodeSearchRuntimeBinary(maps, 5000)
  const originalNow = performance.now
  let now = 0
  let eventLoopTurn = false
  Object.defineProperty(performance, 'now', { value: () => { now += 9; return now }, configurable: true })
  const timer = setTimeout(() => { eventLoopTurn = true }, 0)
  try {
    const input = buffer(bytes)
    const promise = decodeSearchRuntimeBinary(input, 5000, 5000)
    new Uint8Array(input).fill(255)
    structuredClone(input, { transfer: [input] })
    const decoded = await promise
    assert.equal(eventLoopTurn, true)
    assert.deepEqual(decoded.map[0].long, maps[0].long)
  } finally {
    clearTimeout(timer)
    Object.defineProperty(performance, 'now', { value: originalNow, configurable: true })
  }
})
