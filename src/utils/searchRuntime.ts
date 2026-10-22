import FlexSearch from 'flexsearch'
import { foldForSearch } from './searchEncode.js'
import { decodeSearchRuntimeBinary, SEARCH_RUNTIME_PARTITIONS } from './searchRuntimeBinary.js'
import { inflate, searchBytesDigest } from './searchBytes.js'

export { inflate, searchBytesDigest }

export const SEARCH_RUNTIME_FORMAT = 'ammitto-search-runtime/v4'
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
function timing(name: string): void {
  try { globalThis.performance?.mark?.(`ammitto:search:${name}`) } catch { /* unsupported */ }
}

type SearchRuntime = { index: FlexSearch.Index; ids: string[]; prepare: (query: string) => Promise<void>; ready: (query: string) => boolean }

/** Bind the complete table first; prepare only the validated partitions a query needs. */
export async function importSearchRuntime(
  value: unknown,
  rows: readonly Row[],
  generated: string,
  bundle: string,
  fetchPart: (file: string) => Promise<ArrayBuffer>,
  expectedSourceDigest: string,
): Promise<SearchRuntime> {
  const ids = [...new Set(rows.map(row => row.id))]
  if (!dictionary(value) || value.generated !== generated || value.rowCount !== rows.length
    || value.entityCount !== ids.length || value.sourceDigest !== expectedSourceDigest) fail()
  return { ...await openSearchRuntime(value, bundle, fetchPart), ids }
}

/**
 * Validate the manifest's own shape and open the query engine without the
 * catalogue. The caller owns binding it to the published rows: either
 * `importSearchRuntime` (rows in hand) or the partition-first loader, which
 * verifies the shard bytes against `sourceDigest` in the background.
 */
export async function openSearchRuntime(
  value: unknown,
  bundle: string,
  fetchPart: (file: string) => Promise<ArrayBuffer>,
  // Optional off-thread validation (the search worker): resolves to the
  // decoded bytes it fully validated, null when unavailable (validate here),
  // or rejects when the partition is invalid.
  validateOffThread?: (bytes: ArrayBuffer, descriptor: { sha256: string; decodedBytes: number; registeredCount: number },
    part: number, entityCount: number) => Promise<ArrayBuffer | null>,
): Promise<Omit<SearchRuntime, 'ids'> & { entityCount: number }> {
  if (!dictionary(value) || value.format !== SEARCH_RUNTIME_FORMAT || value.engine !== SEARCH_ENGINE_VERSION
    || typeof value.generated !== 'string' || !integer(value.rowCount)
    || !Array.isArray(value.bundles) || !value.bundles.includes(bundle)
    || !dictionary(value.cfg) || value.cfg.doc !== 0 || value.cfg.opt !== 1
    || !Array.isArray(value.ctx) || value.ctx.length !== 1
    || !dictionary(value.ctx[0]) || Object.keys(value.ctx[0]).length !== 0
    || typeof value.sourceDigest !== 'string' || !/^[a-f0-9]{64}$/.test(value.sourceDigest)
    || !integer(value.registeredCount) || !integer(value.entityCount) || value.entityCount > value.rowCount
    || !Array.isArray(value.partitions) || value.partitions.length !== SEARCH_RUNTIME_PARTITIONS
    || typeof value.partitionsDigest !== 'string' || !/^[a-f0-9]{64}$/.test(value.partitionsDigest)) fail()
  if (typeof DecompressionStream !== 'function') fail()
  const entityCount = value.entityCount
  if (value.registeredCount > entityCount
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
  // A partition that failed is never refetched: the caller abandons this runtime.
  const failed = new Set<number>()
  const needed = (query: string) => [...new Set(foldForSearch(query).map(term => term.charCodeAt(0) % SEARCH_RUNTIME_PARTITIONS))]
  const ready = (query: string) => needed(query).every(part => parts[part] === null || loaded.has(part))
  const prepare = async (query: string) => {
    await Promise.all(needed(query).map(async part => {
      const descriptor = parts[part]
      if (descriptor === null || loaded.has(part)) return
      if (failed.has(part)) fail()
      let work = pending.get(part)
      if (!work) {
        work = (async () => {
          const bytes = await fetchPart(descriptor.file)
          timing(`part-${part}-fetched`)
          if (bytes.byteLength !== descriptor.bytes) fail()
          const validated = validateOffThread ? await validateOffThread(bytes, descriptor, part, entityCount) : null
          let map: PostingMap[]
          if (validated) {
            timing(`part-${part}-validated`)
            ;({ map } = await decodeSearchRuntimeBinary(validated, entityCount, descriptor.registeredCount, part, { prevalidated: true }))
          } else {
            if (await searchBytesDigest(bytes) !== descriptor.sha256) fail()
            const decoded = await inflate(bytes, descriptor.decodedBytes)
            timing(`part-${part}-inflated`)
            ;({ map } = await decodeSearchRuntimeBinary(decoded, entityCount, descriptor.registeredCount, part))
          }
          timing(`part-${part}-decoded`)
          loaded.set(part, map)
        })().catch((error: unknown) => { failed.add(part); throw error }).finally(() => pending.delete(part))
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
  return { index, prepare, ready, entityCount }
}
