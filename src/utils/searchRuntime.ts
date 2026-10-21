import FlexSearch from 'flexsearch'
import { foldForSearch } from './searchEncode.js'
import { decodeSearchRuntimeBinary, SEARCH_RUNTIME_PARTITIONS } from './searchRuntimeBinary.js'

export const SEARCH_RUNTIME_FORMAT = 'ammitto-search-runtime/v3'
// Serialized engine compatibility. The generator rejects other installed versions.
export const SEARCH_ENGINE_VERSION = '0.7.43'
const MAX_RUNTIME_BYTES = 64 * 1024 * 1024

export function createSearchIndex(): FlexSearch.Index {
  return new FlexSearch.Index({ tokenize: 'forward', cache: true, encode: foldForSearch })
}

type Row = { id: string }
type Dictionary = Record<string, unknown>
type Part = { file: string; sha256: string; bytes: number; decodedBytes: number; registeredCount: number }
type PostingMap = Record<string, number[]>
const dictionary = (value: unknown): value is Dictionary =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
function fail(): never { throw new Error('Incompatible saved search index') }

export async function searchBytesDigest(bytes: ArrayBuffer): Promise<string> {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}

async function inflate(bytes: ArrayBuffer, expectedBytes: number): Promise<ArrayBuffer> {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader()
  const chunks: BlobPart[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > expectedBytes) fail()
      chunks.push(value)
    }
    if (size !== expectedBytes) fail()
    return await new Blob(chunks).arrayBuffer()
  } finally {
    await reader.cancel().catch(() => {})
  }
}

/** Bind the complete table first; prepare only the validated partitions a query needs. */
export async function importSearchRuntime(
  value: unknown,
  rows: readonly Row[],
  generated: string,
  bundle: string,
  fetchPart: (file: string) => Promise<ArrayBuffer>,
  expectedSourceDigest: string,
): Promise<{ index: FlexSearch.Index; ids: string[]; prepare: (query: string) => Promise<void>; ready: (query: string) => boolean }> {
  if (!dictionary(value) || value.format !== SEARCH_RUNTIME_FORMAT || value.engine !== SEARCH_ENGINE_VERSION
    || value.generated !== generated || value.rowCount !== rows.length
    || !Array.isArray(value.bundles) || !value.bundles.includes(bundle)
    || !dictionary(value.cfg) || value.cfg.doc !== 0 || value.cfg.opt !== 1
    || !Array.isArray(value.ctx) || value.ctx.length !== 1
    || !dictionary(value.ctx[0]) || Object.keys(value.ctx[0]).length !== 0
    || typeof value.sourceDigest !== 'string' || !/^[a-f0-9]{64}$/.test(value.sourceDigest)
    || !integer(value.registeredCount)
    || !Array.isArray(value.partitions) || value.partitions.length !== SEARCH_RUNTIME_PARTITIONS
    || typeof value.partitionsDigest !== 'string' || !/^[a-f0-9]{64}$/.test(value.partitionsDigest)) fail()
  if (typeof DecompressionStream !== 'function') fail()
  const ids = [...new Set(rows.map(row => row.id))]
  if (value.entityCount !== ids.length || value.registeredCount > ids.length
    || value.sourceDigest !== expectedSourceDigest
    || value.partitionsDigest !== await searchBytesDigest(new TextEncoder().encode(JSON.stringify(value.partitions)).buffer)) fail()
  const parts: (Part | null)[] = []
  for (const part of value.partitions) {
    if (part === null) { parts.push(null); continue }
    if (!dictionary(part) || typeof part.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(part.sha256)
      || part.file !== `${part.sha256}.bin` || !integer(part.bytes) || part.bytes < 1 || part.bytes > MAX_RUNTIME_BYTES
      || !integer(part.decodedBytes) || part.decodedBytes < 64 || part.decodedBytes > MAX_RUNTIME_BYTES
      || !integer(part.registeredCount) || part.registeredCount > value.registeredCount) fail()
    parts.push(part as unknown as Part)
  }
  if (parts.reduce((sum, part) => sum + (part?.registeredCount || 0), 0) < value.registeredCount) fail()
  const loaded = new Map<number, PostingMap[]>()
  const pending = new Map<number, Promise<void>>()
  const needed = (query: string) => [...new Set(foldForSearch(query).map(term => term.charCodeAt(0) % SEARCH_RUNTIME_PARTITIONS))]
  const ready = (query: string) => needed(query).every(part => parts[part] === null || loaded.has(part))
  const prepare = async (query: string) => {
    await Promise.all(needed(query).map(async part => {
      const descriptor = parts[part]
      if (descriptor === null || loaded.has(part)) return
      let work = pending.get(part)
      if (!work) {
        work = (async () => {
          const bytes = await fetchPart(descriptor.file)
          if (bytes.byteLength !== descriptor.bytes || await searchBytesDigest(bytes) !== descriptor.sha256) fail()
          const decoded = await inflate(bytes, descriptor.decodedBytes)
          const { map } = await decodeSearchRuntimeBinary(decoded, ids.length, descriptor.registeredCount, part)
          loaded.set(part, map)
        })().finally(() => pending.delete(part))
        pending.set(part, work)
      }
      await work
    }))
  }
  const map = Array.from({ length: 9 }, (_, score) => new Proxy(Object.create(null) as PostingMap, {
    get(_target, key) {
      if (typeof key !== 'string' || !key) return undefined
      const part = key.charCodeAt(0) % SEARCH_RUNTIME_PARTITIONS
      if (parts[part] === null) return undefined
      const buckets = loaded.get(part)
      if (!buckets) throw new Error('Search query has not been prepared')
      return buckets[score][key]
    },
  }))
  const index = createSearchIndex()
  // This private index is query-only; register/update/export are not used.
  for (const [key, data] of Object.entries({ reg: Object.create(null), cfg: value.cfg, map, ctx: [Object.create(null)] })) {
    await index.import(key, data as unknown as string)
  }
  return { index, ids, prepare, ready }
}
