import FlexSearch from 'flexsearch'
import { foldForSearch } from './searchEncode.js'
import { forEachWithinBudget } from './budgetedEach.js'
import { yieldToEventLoop } from './yieldToEventLoop.js'

export const SEARCH_RUNTIME_FORMAT = 'ammitto-search-runtime/v1'
// Serialized engine compatibility. The generator rejects other installed versions.
export const SEARCH_ENGINE_VERSION = '0.7.43'
const MAX_CHUNK_BYTES = 1024 * 1024

export function createSearchIndex(): FlexSearch.Index {
  return new FlexSearch.Index({ tokenize: 'forward', cache: true, encode: foldForSearch })
}

type Row = { id: string }
type Dictionary = Record<string, unknown>
type Chunk = { file: string; sha256: string; bytes: number; kind: 'reg' | 'map'; score?: number }
const dictionary = (value: unknown): value is Dictionary =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
function fail(): never { throw new Error('Incompatible saved search index') }

export async function searchBytesDigest(bytes: ArrayBuffer): Promise<string> {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}

const digest = (text: string) => searchBytesDigest(new TextEncoder().encode(text).buffer)

/** Load only a complete index built for these exact rows and this application bundle. */
export async function importSearchRuntime(
  value: unknown,
  rows: readonly Row[],
  generated: string,
  bundle: string,
  fetchChunk: (file: string) => Promise<ArrayBuffer>,
  expectedSourceDigest: string,
): Promise<{ index: FlexSearch.Index; ids: string[] }> {
  if (!dictionary(value) || value.format !== SEARCH_RUNTIME_FORMAT || value.engine !== SEARCH_ENGINE_VERSION
    || value.generated !== generated || value.rowCount !== rows.length
    || !Array.isArray(value.bundles) || !value.bundles.includes(bundle)
    || !Array.isArray(value.chunks) || value.chunks.length > 1024
    || typeof value.chunksDigest !== 'string' || !/^[a-f0-9]{64}$/.test(value.chunksDigest)
    || !dictionary(value.cfg) || value.cfg.doc !== 0 || value.cfg.opt !== 1
    || !Array.isArray(value.ctx) || value.ctx.length !== 1
    || !dictionary(value.ctx[0]) || Object.keys(value.ctx[0]).length !== 0
    || typeof value.sourceDigest !== 'string' || !/^[a-f0-9]{64}$/.test(value.sourceDigest)
    || !integer(value.registeredCount)) fail()
  const ids = [...new Set(rows.map(row => row.id))]
  if (value.entityCount !== ids.length || value.registeredCount > ids.length
    || value.sourceDigest !== expectedSourceDigest
    || value.chunksDigest !== await digest(JSON.stringify(value.chunks))) fail()

  const chunks: Chunk[] = []
  const seen = new Set<string>()
  for (const item of value.chunks) {
    if (!dictionary(item) || typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256)
      || item.file !== `${item.sha256}.json` || !integer(item.bytes) || item.bytes < 1 || item.bytes > MAX_CHUNK_BYTES
      || (item.kind !== 'reg' && item.kind !== 'map')
      || (item.kind === 'map' && (!integer(item.score) || item.score > 8))
      || (item.kind === 'reg' && item.score !== undefined)) fail()
    const key = `${item.kind}:${item.score}:${item.file}`
    if (seen.has(key)) fail()
    seen.add(key)
    chunks.push(item as unknown as Chunk)
  }

  const register: Dictionary = Object.create(null)
  const map: Dictionary[] = Array.from({ length: 9 }, () => Object.create(null))
  // Small independent chunks bound parse/validation tasks. Fetch a bounded batch,
  // then yield between chunks instead of parsing one 40 MB object on the UI thread.
  for (let offset = 0; offset < chunks.length; offset += 8) {
    const batch = chunks.slice(offset, offset + 8)
    const buffers = await Promise.all(batch.map(chunk => fetchChunk(chunk.file)))
    for (let i = 0; i < batch.length; i++) {
      const chunk = batch[i]
      const bytes = buffers[i]
      if (bytes.byteLength !== chunk.bytes || await searchBytesDigest(bytes) !== chunk.sha256) fail()
      const data: unknown = JSON.parse(new TextDecoder().decode(bytes))
      if (!dictionary(data)) fail()
      const target = chunk.kind === 'reg' ? register : map[chunk.score!]
      await forEachWithinBudget(Object.keys(data), key => {
        if (Object.prototype.hasOwnProperty.call(target, key)) fail()
        const entry = data[key]
        if (chunk.kind === 'reg') {
          if (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= ids.length || entry !== 1) fail()
        } else if (!Array.isArray(entry)
          || !entry.every(id => integer(id) && id < ids.length)) fail()
        target[key] = entry
      }, { budgetMs: 40, checkEvery: 25, now: () => performance.now(), yieldControl: yieldToEventLoop })
      await yieldToEventLoop()
    }
  }
  if (Object.keys(register).length !== value.registeredCount) fail()
  const index = createSearchIndex()
  // FlexSearch 0.7 accepts parsed objects; its older declarations say string only.
  // Copying into null-prototype dictionaries also prevents inherited query keys
  // such as "constructor" from being mistaken for posting lists after JSON.parse.
  for (const [key, data] of Object.entries({ reg: register, cfg: value.cfg, map, ctx: [Object.create(null)] })) {
    await index.import(key, data as unknown as string)
  }
  return { index, ids }
}
