import { yieldToEventLoop } from './yieldToEventLoop.js'

export const SEARCH_BINARY_MAX_BYTES = 64 * 1024 * 1024
export const SEARCH_BINARY_MAX_ENTITIES = 2 ** 24
export const SEARCH_BINARY_CACHE_TERMS = 64
export const SEARCH_BINARY_CACHE_IDS = 262144
export const SEARCH_RUNTIME_PARTITIONS = 64
const HEADER_BYTES = 64
const BUCKETS = 9
const MAGIC = 'AMMITTO2'
type PostingMap = Record<string, number[]>
type Bucket = { count: number; ids: number; offsets: number }
function invalid(): never { throw new Error('Invalid binary search index') }
function count(value: number, max: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= max
}
function zigzag(delta: number): number { return delta < 0 ? -2 * delta - 1 : 2 * delta }
function varintBytes(value: number): number {
  let length = 1
  while (value >= 128) { value = Math.floor(value / 128); length++ }
  return length
}

/** Build-time serialization; posting order and duplicate IDs are preserved. */
export function encodeSearchRuntimeBinary(maps: ReadonlyArray<PostingMap>, entityCount: number): Uint8Array {
  if (!count(entityCount, SEARCH_BINARY_MAX_ENTITIES) || maps.length !== BUCKETS
    || maps.some(map => !map || typeof map !== 'object' || Array.isArray(map))) invalid()
  const keys = maps.map(map => Object.keys(map).sort())
  const terms = [...new Set(keys.flat())].sort()
  const dictionary = new TextEncoder().encode(JSON.stringify(terms))
  const termIDs = new Map(terms.map((term, id) => [term, id]))
  const entryCount = keys.reduce((sum, bucket) => sum + bucket.length, 0)
  const tableStart = HEADER_BYTES + Math.ceil(dictionary.byteLength / 4) * 4
  const postingStart = tableStart + entryCount * 8 + BUCKETS * 4
  if (postingStart > SEARCH_BINARY_MAX_BYTES) invalid()
  let postingLength = 0
  for (let score = 0; score < BUCKETS; score++) {
    for (const term of keys[score]) {
      const values = maps[score][term]
      if (!Array.isArray(values)) invalid()
      let previous = 0
      for (const id of values) {
        if (!count(id, entityCount - 1)) invalid()
        postingLength += varintBytes(zigzag(id - previous))
        if (postingStart + postingLength > SEARCH_BINARY_MAX_BYTES) invalid()
        previous = id
      }
    }
  }
  const bytes = new Uint8Array(postingStart + postingLength)
  const view = new DataView(bytes.buffer)
  bytes.set(new TextEncoder().encode(MAGIC))
  ;[dictionary.byteLength, terms.length, entityCount, entryCount, postingLength, ...keys.map(bucket => bucket.length)]
    .forEach((value, index) => view.setUint32(8 + index * 4, value, true))
  bytes.set(dictionary, HEADER_BYTES)
  let cursor = tableStart
  let postingCursor = 0
  for (let score = 0; score < BUCKETS; score++) {
    const bucket = keys[score]
    for (let i = 0; i < bucket.length; i++) view.setUint32(cursor + i * 4, termIDs.get(bucket[i])!, true)
    cursor += bucket.length * 4
    for (let i = 0; i < bucket.length; i++) {
      view.setUint32(cursor + i * 4, postingCursor, true)
      let previous = 0
      for (const id of maps[score][bucket[i]]) {
        let value = zigzag(id - previous)
        while (value >= 128) {
          bytes[postingStart + postingCursor++] = (value % 128) | 128
          value = Math.floor(value / 128)
        }
        bytes[postingStart + postingCursor++] = value
        previous = id
      }
    }
    view.setUint32(cursor + bucket.length * 4, postingCursor, true)
    cursor += (bucket.length + 1) * 4
  }
  return bytes
}

/**
 * Validate everything before exposing lookup-only dictionaries to FlexSearch.
 * These buckets support immutable search; enumeration/export and index updates
 * are unsupported. Posting arrays stay ordinary arrays for the engine's API.
 */
export async function decodeSearchRuntimeBinary(
  buffer: ArrayBuffer, entityCount: number, registeredCount: number, expectedPartition?: number,
  options: { prevalidated?: boolean } = {},
): Promise<{ map: PostingMap[]; register: Record<string, number> }> {
  // `prevalidated`: this exact buffer already passed the full validation below
  // (in the search worker, same code); only the cheap structural checks rerun.
  const full = !options.prevalidated
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < HEADER_BYTES || buffer.byteLength > SEARCH_BINARY_MAX_BYTES
    || !count(entityCount, SEARCH_BINARY_MAX_ENTITIES) || !count(registeredCount, entityCount)
    || (expectedPartition !== undefined && !count(expectedPartition, SEARCH_RUNTIME_PARTITIONS - 1))) invalid()
  // Keep validation and later lookups independent of caller mutation/detachment.
  const owned = buffer.slice(0)
  const bytes = new Uint8Array(owned)
  const view = new DataView(owned)
  for (let i = 0; i < MAGIC.length; i++) if (bytes[i] !== MAGIC.charCodeAt(i)) invalid()
  const word = (index: number) => view.getUint32(8 + index * 4, true)
  const [dictionaryLength, termCount, storedEntities, entryCount, postingLength] = Array.from({ length: 5 }, (_, i) => word(i))
  const counts = Array.from({ length: BUCKETS }, (_, i) => word(5 + i))
  const tableStart = HEADER_BYTES + Math.ceil(dictionaryLength / 4) * 4
  const postingStart = tableStart + entryCount * 8 + BUCKETS * 4
  if (storedEntities !== entityCount || counts.reduce((sum, n) => sum + n, 0) !== entryCount
    || termCount > entryCount || dictionaryLength < 2 || postingStart + postingLength !== buffer.byteLength) invalid()
  for (let i = HEADER_BYTES + dictionaryLength; i < tableStart; i++) if (bytes[i] !== 0) invalid()
  const dictionaryText = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(HEADER_BYTES, HEADER_BYTES + dictionaryLength))
  const parsed: unknown = JSON.parse(dictionaryText)
  if (!Array.isArray(parsed) || parsed.length !== termCount) invalid()
  const terms: string[] = parsed
  let work = 0
  let start = performance.now()
  const outOfBudget = () => ++work % 256 === 0 && performance.now() - start >= 8
  const yieldWork = async () => { await yieldToEventLoop(); start = performance.now() }
  for (let i = 0; full && i < terms.length; i++) {
    if (typeof terms[i] !== 'string' || (i > 0 && terms[i - 1] >= terms[i])
      || (expectedPartition !== undefined && (!terms[i].length
        || (terms[i].charCodeAt(0) || 0) % SEARCH_RUNTIME_PARTITIONS !== expectedPartition))) invalid()
    if (outOfBudget()) await yieldWork()
  }
  // JSON escaping preserves lone UTF-16 surrogates; UTF-8 term separators would not.
  if (full && JSON.stringify(terms) !== dictionaryText) invalid()
  const buckets: Bucket[] = []
  const usedTerms = new Uint8Array(termCount)
  let cursor = tableStart
  let offset = 0
  for (const n of counts) {
    const bucket = { count: n, ids: cursor, offsets: cursor + n * 4 }
    let previousTerm = -1
    for (let i = 0; full && i < n; i++) {
      const id = view.getUint32(bucket.ids + i * 4, true)
      if (id <= previousTerm || id >= termCount) invalid()
      previousTerm = id
      usedTerms[id] = 1
      if (outOfBudget()) await yieldWork()
    }
    for (let i = 0; full && i <= n; i++) {
      const next = view.getUint32(bucket.offsets + i * 4, true)
      if ((i === 0 && next !== offset) || next < offset || next > postingLength) invalid()
      offset = next
      if (outOfBudget()) await yieldWork()
    }
    buckets.push(bucket)
    cursor += (n * 2 + 1) * 4
  }
  if (full && (offset !== postingLength || usedTerms.some(used => used !== 1))) invalid()

  // No arrays are materialized in this scan, including very long prefix lists.
  const seen = new Uint8Array(Math.ceil(entityCount / 8))
  let seenCount = 0
  for (const bucket of full ? buckets : []) {
    for (let i = 0; i < bucket.count; i++) {
      let position = postingStart + view.getUint32(bucket.offsets + i * 4, true)
      const end = postingStart + view.getUint32(bucket.offsets + (i + 1) * 4, true)
      let previous = 0
      while (position < end) {
        let value = 0
        let multiplier = 1
        let length = 0
        let digit: number
        do {
          if (position >= end || ++length > 4) invalid()
          digit = bytes[position++]
          value += (digit & 127) * multiplier
          multiplier *= 128
        } while (digit & 128)
        if ((length > 1 && digit === 0) || value > 2 * (SEARCH_BINARY_MAX_ENTITIES - 1)) invalid()
        previous += value % 2 ? -(value + 1) / 2 : value / 2
        // `previous` is always an integer here (zigzag halves are exact).
        if (previous < 0 || previous >= entityCount) invalid()
        const mask = 1 << (previous & 7)
        const byte = previous >>> 3
        if (!(seen[byte] & mask)) {
          seen[byte] |= mask
          seenCount++
        }
        if (outOfBudget()) await yieldWork()
      }
      if (outOfBudget()) await yieldWork()
    }
  }
  if (full && seenCount !== registeredCount) invalid()

  const immutable = (): never => { throw new Error('Binary search index is read-only') }
  const map = buckets.map(bucket => {
    const cache = new Map<string, number[]>()
    let cachedIDs = 0
    return new Proxy(Object.create(null) as PostingMap, {
      get(_target, key) {
        if (typeof key !== 'string') return undefined
        const cached = cache.get(key)
        if (cached) return cached
        let low = 0, high = bucket.count - 1
        while (low <= high) {
          const mid = Math.floor((low + high) / 2)
          const term = terms[view.getUint32(bucket.ids + mid * 4, true)]
          if (term < key) low = mid + 1
          else if (term > key) high = mid - 1
          else {
            const values: number[] = []
            let position = postingStart + view.getUint32(bucket.offsets + mid * 4, true)
            const end = postingStart + view.getUint32(bucket.offsets + (mid + 1) * 4, true)
            let previous = 0
            while (position < end) {
              let value = 0, multiplier = 1, digit: number
              do { digit = bytes[position++]; value += (digit & 127) * multiplier; multiplier *= 128 } while (digit & 128)
              previous += value % 2 ? -(value + 1) / 2 : value / 2
              values.push(previous)
            }
            Object.freeze(values)
            if (values.length <= SEARCH_BINARY_CACHE_IDS) {
              while (cache.size >= SEARCH_BINARY_CACHE_TERMS || cachedIDs + values.length > SEARCH_BINARY_CACHE_IDS) {
                const oldest = cache.keys().next().value!
                cachedIDs -= cache.get(oldest)!.length
                cache.delete(oldest)
              }
              cache.set(key, values)
              cachedIDs += values.length
            }
            return values
          }
        }
        return undefined
      },
      set: immutable, defineProperty: immutable, deleteProperty: immutable,
      setPrototypeOf: immutable, preventExtensions: immutable,
    })
  })
  // The register is only needed by callers that import it; building a 64k-key
  // object per partition on the query path cost more than the whole scan.
  let register: Record<string, number> | null = null
  return {
    map,
    get register() {
      if (!full) throw new Error('Register unavailable for a prevalidated buffer')
      if (!register) {
        register = Object.create(null) as Record<string, number>
        for (let id = 0; id < entityCount; id++) if (seen[id >> 3] & (1 << (id % 8))) register[id] = 1
      }
      return register
    },
  }
}
