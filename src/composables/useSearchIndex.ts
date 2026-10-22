import { ref, shallowRef, triggerRef, computed, toRaw } from 'vue'
import FlexSearch from 'flexsearch'
import { createSearchIndex, importSearchRuntime, inflate, openSearchRuntime, searchBytesDigest } from '@/utils/searchRuntime'
import {
  decodeFastColumns,
  decodeFastIds,
  decodeFastRows,
  fastResults,
  fastFilterFields,
  decodeSuggestionTokens,
  FAST_FILTER_FIELDS,
  validateFastManifest,
  type FastAsset,
  type FastColumns,
  type FastManifest,
} from '@/utils/searchFast'
import { fetchVerifiedAsset, pruneSearchAssets, searchAssetKey } from '@/utils/searchAssetCache'
import { normalizeNode } from '@/utils/normalizeNode'
import { searchRowText } from '@/utils/birthAdapters'
import type { SearchBirthYear } from '@/utils/birthDisplay'
import { forEachWithinBudget } from '@/utils/budgetedEach'
import { yieldToEventLoop } from '@/utils/yieldToEventLoop'
import { getEntityNodePath } from '@/utils/entityUrls'
import { checkMetadata, type CheckedMetadata } from '@/utils/indexMetadata'
import { partialMatchIds } from '@/utils/progressiveResults'
import {
  foldForSearch,
  indexableText,
  nearestNames,
  type NearMiss,
} from '@/utils/searchEncode'
import {
  isSearchIndexManifest,
  orderShards,
} from '@/utils/searchShards'
import {
  filterSearchEntities,
  type SearchFilterSelection,
} from '@/utils/searchFilters'

/**
 * Lightweight search entity from a search-index shard.
 *
 * Only `id`, `ref`, `type`, `names` and `status` are guaranteed: the
 * producer (the gem's SearchIndexExporter) compacts every other field
 * away when the source carries no value, and defaults `type` to "person"
 * and `status` to "active". `names` is always an array but may be empty.
 *
 * At the gem SHA this site pins, one entity yields one row per sanction
 * entry, so the same `id` can repeat. Row deduplication by entity id is
 * an unmerged upstream change (ammitto/ammitto#27); nothing here may
 * assume ids are unique until that lands and the pin moves.
 */
export interface SearchEntity {
  id: string
  ref: string // e.g., "un/KPi.066"
  // The four values the gem's transformers emit today; the producer's
  // own contract is any non-blank string, so unknown values must not be
  // a type error here.
  type: 'person' | 'organization' | 'vessel' | 'aircraft' | (string & {})
  names: string[]
  primaryName?: string
  country?: string
  regime?: string
  authority?: string
  // Which published list the entry appears on. Every live row carries one,
  // but the producer compacts absent values, and it emits the literal
  // 'unknown' for an entry it could not place — so a missing field and
  // 'unknown' are different states and must not be conflated.
  listType?: string
  status?: string
  // Every year and span the person's records state; see SearchBirthYear.
  birthYears?: SearchBirthYear[]
  imo?: string
}

/** One search-index shard: the rows of a single authority. */
interface SearchShardResponse {
  entities: SearchEntity[]
}

/**
 * Facet data from API
 */
export interface FacetItem {
  code: string
  name?: string
  count: number
  icon?: string
  color?: string
}

interface FacetsResponse {
  facets: FacetItem[]
}

// Global state
// Rows and FlexSearch internals are read-only after indexing. Deep proxies
// charge every lookup/iteration for tracking that no reader needs. Publish
// the shallow Map once per budgeted step instead of notifying per row.
const searchIndex = shallowRef<FlexSearch.Index | null>(null)
const entities = shallowRef<Map<string, SearchEntity>>(new Map())
const isLoading = ref(false)
const isLoaded = ref(false)
// Saved indexes use compact numeric posting IDs; the fallback retains string IDs.
let savedDocumentIds: string[] | null = null
let queryRuntime: Awaited<ReturnType<typeof importSearchRuntime>> | null = null
const isQueryLoading = ref(false)
let queryVersion = 0
let skipSavedRuntime = false
let fallbackBuild: Promise<void> | null = null

/**
 * Partition-first state: answers search, filters and counts from the saved
 * runtime plus the filter columns, and fetches card rows per visible chunk,
 * before (and without) the catalogue. Null when the regular path is in use.
 */
interface FastState {
  manifest: FastManifest
  ids: string[]
  columns: FastColumns
  results: ReturnType<typeof fastResults>
  rows: (SearchEntity[] | undefined)[]
  pendingRows: Map<number, Promise<void>>
  /** Cache keys of every asset the current manifest references (prune keep-set). */
  keys: Set<string>
  suggestions: Promise<void> | null
}
let fast: FastState | null = null
/** Bumped when a row chunk lands, so card lists re-read `rowFor`. */
const rowsVersion = ref(0)
/** The complete catalogue (entities Map) is hydrated: suggestions, getEntity. */
const catalogueReady = ref(false)
/** Partition-first: the build's suggestion candidates have loaded. */
const tokensReady = ref(false)
const error = ref<string | null>(null)
const metadata = ref<CheckedMetadata | null>(null)

/**
 * Whether a malformed metadata block has already been reported. The page
 * words around a bad field silently, so without one warning a producer
 * regression would be invisible; one is enough.
 */
let reportedBadMetadata = false

/**
 * How many rows the index build has added so far.
 *
 * Updated once per build step, when the build yields, not per row: every
 * write re-runs whatever watches it, and per row that would be 61k runs.
 */
const indexedCount = ref(0)

/**
 * The index while it is being built, for `searchPartial` only.
 *
 * Deliberately not `searchIndex`: that ref is what `search()` guards on, and
 * `search()` must keep answering nothing until every row is in (see there).
 * Cleared when the build ends, successfully or not.
 */
let partialIndex: FlexSearch.Index | null = null

/** Ids that occur on more than one row; see progressiveResults.ts. */
let repeatedIds: ReadonlySet<string> = new Set()

// Facet caches
const authorityFacets = ref<FacetItem[]>([])
const regimeFacets = ref<FacetItem[]>([])
const typeFacets = ref<FacetItem[]>([])
const statusFacets = ref<FacetItem[]>([])
const listTypeFacets = ref<FacetItem[]>([])

// Base URL for API
const API_BASE = import.meta.env.BASE_URL || '/'

// Check if running in browser
const isBrowser = typeof window !== 'undefined'

/**
 * How long one step of the index build may hold the main thread before it
 * yields, in milliseconds.
 *
 * The build (FlexSearch's `add` plus the `indexableText`/`foldForSearch`
 * folding) is CPU-bound and yielding cannot make it cheaper; the budget only
 * decides how often typing and the search debounce timer get a turn while
 * the corpus is still indexing. It is a time budget rather than a row count
 * because a row count cannot bound the block: adding a row costs more as the
 * index fills, so a count that is quick early on is slow late in the build.
 *
 * Measured on 2026-09-23 through the real page load in headless Chromium,
 * against the 61,348-row live index, five runs per setting: fixed 750-row
 * and 2000-row steps blocked for up to ~180ms and ~340ms (~810ms and
 * ~1,510ms at 4x CPU throttling), while this 40ms budget peaked at ~60ms
 * (~160ms at 4x). The single ~125-160ms block that remains at 4x persisted
 * even with a 16ms budget, so it does not come from step size; it has not
 * been profiled (garbage collection or an internal resize are guesses).
 *
 * A budget yields more often than a large fixed step, so what one yield
 * costs matters. With `setTimeout(0)` it cost about 5ms (browser timer
 * clamping), which made the budgeted build ~5-7% slower than the 750-row
 * steps at 4x in a later run the same day; `yieldToEventLoop` posts a message
 * instead, see there.
 */
const INDEX_BUDGET_MS = 40

/** Rows indexed between clock reads, so reading the clock stays negligible. */
const INDEX_BUDGET_CHECK_EVERY = 25

const RUNTIME_BASE = `${API_BASE}search-runtime/`
const INDEX_BASE = `${API_BASE}api/v1/search-index/`

async function fetchBytes(url: string, abandon?: AbortSignal): Promise<ArrayBuffer> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  const stop = () => controller.abort()
  if (abandon?.aborted) controller.abort()
  abandon?.addEventListener('abort', stop)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error('Saved search asset unavailable')
    return await response.arrayBuffer()
  } finally { clearTimeout(timeout); abandon?.removeEventListener('abort', stop) }
}

function absoluteKey(url: string, sha256: string): string {
  const key = searchAssetKey(url, sha256)
  try { return new URL(key, globalThis.location?.href).href } catch { return key }
}

async function fastJson(asset: FastAsset): Promise<unknown> {
  const url = `${RUNTIME_BASE}${asset.file}`
  const bytes = await fetchVerifiedAsset(url, asset.sha256, asset.bytes, fetchBytes)
  return JSON.parse(new TextDecoder().decode(await inflate(bytes, asset.decodedBytes)))
}

function invalidFast(): never { throw new Error('Incompatible saved search index') }

/**
 * Up to two search workers validate partitions off the main thread (two is
 * what a query usually needs, one per first-letter partition). Any worker
 * failure (unsupported, CSP, crash) returns null and the page validates
 * in-thread with the same code, so this only ever changes where work runs.
 */
type PartReply = { id: number; ok: true; decoded: ArrayBuffer } | { id: number; ok: false }
let partWorkers: Worker[] | null = null
let partWorkerTurn = 0
let partRequestId = 0
const partReplies = new Map<number, { resolve: (value: ArrayBuffer | null) => void; reject: (error: Error) => void }>()

function searchPartWorker(): Worker | null {
  if (partWorkers === null) {
    partWorkers = []
    try {
      const count = Math.max(1, Math.min(2, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1))
      for (let i = 0; i < count; i++) {
        const worker = new Worker(new URL('../utils/searchPartWorker.ts', import.meta.url), { type: 'module' })
        worker.onmessage = ({ data }: MessageEvent<PartReply>) => {
          const pending = partReplies.get(data.id)
          if (!pending) return
          partReplies.delete(data.id)
          if (data.ok) pending.resolve(data.decoded)
          else pending.reject(new Error('Incompatible saved search index'))
        }
        worker.onerror = () => {
          // Unusable worker: drop it and let every request it held validate in-thread.
          partWorkers = (partWorkers ?? []).filter(other => other !== worker)
          for (const [id, pending] of partReplies) { partReplies.delete(id); pending.resolve(null) }
          worker.terminate()
        }
        partWorkers.push(worker)
      }
    } catch { /* No module workers: validate in-thread. */ }
  }
  if (!partWorkers.length) return null
  return partWorkers[partWorkerTurn++ % partWorkers.length]
}

function validatePartOffThread(
  bytes: ArrayBuffer,
  descriptor: { sha256: string; decodedBytes: number; registeredCount: number },
  part: number,
  entityCount: number,
): Promise<ArrayBuffer | null> {
  const worker = searchPartWorker()
  if (!worker) return Promise.resolve(null)
  return new Promise((resolve, reject) => {
    const id = ++partRequestId
    partReplies.set(id, { resolve, reject })
    // A copy is transferred: the caller's bytes may still be written to the cache.
    const copy = bytes.slice(0)
    try {
      worker.postMessage({ id, bytes: copy, sha256: descriptor.sha256, decodedBytes: descriptor.decodedBytes,
        entityCount, registeredCount: descriptor.registeredCount, part }, [copy])
    } catch {
      partReplies.delete(id)
      resolve(null)
    }
  })
}

/** Phase marks for the performance harness (User Timing; no effect on behaviour). */
function mark(name: string): void {
  try { globalThis.performance?.mark?.(`ammitto:search:${name}`) } catch { /* unsupported */ }
}

/**
 * Partition-first load. Starts the query's partitions at once (from the URL's
 * query), alongside the ids and filter columns, and publishes an exact,
 * query-ready index without downloading the catalogue. The catalogue follows
 * in the background and re-verifies the binding; a mismatch falls back to the
 * regular builder. Returns false (caller continues with the regular path) when
 * the build carries no fast assets; throws when they are present but invalid.
 */
async function loadFast(
  savedRuntime: Promise<unknown>,
  sourceManifest: Promise<unknown>,
  hint: string,
): Promise<boolean> {
  const payload = await savedRuntime
  mark('runtime-manifest')
  if (payload === null || typeof payload !== 'object' || !(payload as { fast?: unknown }).fast) return false
  const value = payload as Record<string, unknown>
  const keys = new Set<string>()
  // Aborted if this load is abandoned, so a hinted prefetch stops downloading.
  const abandon = new AbortController()
  try {
  const partBytes = new Map<string, number>()
  if (Array.isArray(value.partitions)) {
    for (const part of value.partitions) {
      if (part && typeof part === 'object') partBytes.set(String((part as FastAsset).file), Number((part as FastAsset).bytes))
    }
  }
  const runtime = await openSearchRuntime(payload, new URL(import.meta.url).pathname.split('/').pop() || '', file => {
    if (abandon.signal.aborted) invalidFast()
    return fetchVerifiedAsset(`${RUNTIME_BASE}${file}`, file.slice(0, -4), partBytes.get(file) ?? -1,
      url => fetchBytes(url, abandon.signal))
  }, validatePartOffThread)
  const manifest = validateFastManifest(value.fast, runtime.entityCount)
  if (value.fastDigest !== await searchBytesDigest(new TextEncoder().encode(JSON.stringify(value.fast)).buffer)
    || value.sourceDigest !== await searchBytesDigest(new TextEncoder().encode(JSON.stringify(
      manifest.sources.map(source => [source.code, source.file, source.sha256]))).buffer)
    || manifest.sources.reduce((sum, source) => sum + source.count, 0) !== value.rowCount) invalidFast()
  // Every asset this manifest references, fetched this visit or not: the
  // prune keep-set, so a later visit's different query never evicts them.
  for (const [file, sha256] of [...partBytes.keys()].map(file => [file, file.slice(0, -4)])) {
    keys.add(absoluteKey(`${RUNTIME_BASE}${file}`, sha256))
  }
  for (const asset of [manifest.ids, manifest.columns, manifest.suggestions, ...manifest.rows]) {
    keys.add(absoluteKey(`${RUNTIME_BASE}${asset.file}`, asset.sha256))
  }
  for (const source of manifest.sources) keys.add(absoluteKey(`${INDEX_BASE}${source.file}`, source.sha256))
  // The published shard manifest (requested alongside index.json, fetched
  // fresh) must describe exactly the shards (order, files, counts) and the
  // generation the runtime was built from. Checked before any asset is fetched.
  const source = await sourceManifest
  if (!isSearchIndexManifest(source) || source.metadata.generated !== value.generated) invalidFast()
  const ordered = orderShards(source.shards)
  if (ordered.length !== manifest.sources.length || ordered.some((shard, index) => {
    const expected = manifest.sources[index]
    return shard.code !== expected.code || shard.file !== expected.file || shard.count !== expected.count
  })) invalidFast()
  // Start the query's partitions now; prepareSearch later joins this work.
  const hinted = typeof hint === 'string' && hint.trim() ? runtime.prepare(hint).catch(() => {}) : Promise.resolve()
  const [idsValue, columnsValue] = await Promise.all([fastJson(manifest.ids), fastJson(manifest.columns)])
  mark('ids-columns')
  const ids = decodeFastIds(idsValue, runtime.entityCount)
  const columns = decodeFastColumns(columnsValue, runtime.entityCount)
  publishMetadata(source.metadata)
  const state: FastState = {
    manifest, ids, columns, results: fastResults(ids, columns),
    rows: new Array(manifest.rows.length), pendingRows: new Map(), keys, suggestions: null,
  }
  fast = state
  queryRuntime = { index: runtime.index, ids, prepare: runtime.prepare, ready: runtime.ready }
  savedDocumentIds = ids
  indexedCount.value = Number(value.rowCount)
  searchIndex.value = runtime.index
  isLoaded.value = true
  mark('fast-ready')
  // The catalogue must not compete with the first answer for bandwidth.
  void hinted.then(() => {
    if (fast !== state) return
    void pruneSearchAssets(state.keys)
    scheduleCatalogue(state)
  })
  return true
  } catch (error) {
    abandon.abort()
    throw error
  }
}

function publishMetadata(raw: unknown): void {
  metadata.value = checkMetadata(raw)
  if (metadata.value.invalid.length && !reportedBadMetadata) {
    reportedBadMetadata = true
    console.warn(
      `search-index manifest metadata: absent or invalid ${metadata.value.invalid.join(', ')}; ` +
        'the page omits them rather than state them',
      raw,
    )
  }
}

/** Card rows (and the whole catalogue) are not on the first-result path: start them once the page is idle. */
function scheduleCatalogue(state: FastState): void {
  const start = () => { void loadCatalogue(state) }
  const idle = (globalThis as { requestIdleCallback?: (fn: () => void, options?: { timeout: number }) => void }).requestIdleCallback
  setTimeout(() => (idle ? idle(start, { timeout: 2000 }) : start()), 500)
}

/**
 * Background: fetch the exact shard bytes (verified against the runtime's
 * source hashes), re-check the row binding, then hydrate the catalogue for
 * suggestions and entity lookups. Any mismatch replaces the fast path with
 * the regular builder, which re-renders from scratch.
 */
async function loadCatalogue(state: FastState): Promise<void> {
  if (fast !== state) return
  try {
    const shards = await Promise.all(state.manifest.sources.map(async source => {
      if (fast !== state) return []
      const bytes = await fetchVerifiedAsset(`${INDEX_BASE}${source.file}`, source.sha256, source.bytes, fetchBytes)
      if (fast !== state) return []
      const data = JSON.parse(new TextDecoder().decode(bytes)) as SearchShardResponse
      if (!Array.isArray(data?.entities) || data.entities.length !== source.count) invalidFast()
      await yieldToEventLoop()
      return data.entities
    }))
    if (fast !== state) return
    const hydrated = new Map<string, SearchEntity>()
    await forEachWithinBudget(shards.flat(), row => hydrated.set(row.id, row), {
      budgetMs: INDEX_BUDGET_MS, checkEvery: INDEX_BUDGET_CHECK_EVERY,
      now: () => performance.now(), yieldControl: yieldToEventLoop,
    })
    if (fast !== state) return
    // Re-verify everything the fast path has shown against the verified rows:
    // order, every filter column, and each row chunk already on screen.
    const docs = [...hydrated.values()]
    if (docs.length !== state.ids.length) invalidFast()
    let index = 0
    await forEachWithinBudget(docs, (doc) => {
      index++
      if (doc.id !== state.ids[index - 1]) invalidFast()
      const fields = fastFilterFields(state.columns, index - 1) as Record<string, unknown>
      for (const field of FAST_FILTER_FIELDS) {
        if (fields[field] !== (doc as unknown as Record<string, unknown>)[field]) invalidFast()
      }
    }, {
      budgetMs: INDEX_BUDGET_MS, checkEvery: INDEX_BUDGET_CHECK_EVERY,
      now: () => performance.now(), yieldControl: yieldToEventLoop,
    })
    const size = state.manifest.rowChunk
    state.rows.forEach((chunk, number) => {
      if (chunk && JSON.stringify(chunk) !== JSON.stringify(docs.slice(number * size, number * size + chunk.length))) invalidFast()
    })
    if (fast !== state) return
    entities.value = hydrated
    catalogueReady.value = true
    rowsVersion.value++
    mark('catalogue-ready')
  } catch {
    if (fast === state) void startFallback()
  }
}

/** Partition-first suggestions: fetch the build's token list (only when a query found nothing). */
function loadSuggestions(): void {
  const state = fast
  if (!state || state.suggestions || tokensReady.value || catalogueReady.value) return
  state.suggestions = (async () => {
    const tokens = decodeSuggestionTokens(await fastJson(state.manifest.suggestions))
    if (fast !== state) return
    suggestionTokens = new Set(tokens)
    lastSuggestKey = null
    tokensReady.value = true
  })().catch(() => { if (fast === state) void startFallback() })
}

/** Whether `suggestFor` can answer now; when false, call `loadSuggestions`. */
const suggestionsReady = computed(() => catalogueReady.value || tokensReady.value)

function stubAt(state: FastState, index: number): SearchEntity {
  return state.results.at(index) as unknown as SearchEntity
}

/** The full row behind a search result: itself, or (partition-first) its loaded chunk row. */
function rowFor(entity: SearchEntity): SearchEntity | undefined {
  const state = fast
  const index = state?.results.indexOf(toRaw(entity))
  if (!state || index === undefined) return entity
  if (catalogueReady.value) return entities.value.get(state.ids[index])
  const size = state.manifest.rowChunk
  return state.rows[Math.floor(index / size)]?.[index % size]
}

/** Fetch the row chunks holding these results (visible cards only). */
async function ensureRows(list: readonly SearchEntity[]): Promise<void> {
  const state = fast
  if (!state || catalogueReady.value) return
  const size = state.manifest.rowChunk
  const chunks = new Set<number>()
  for (const entity of list) {
    const index = state.results.indexOf(toRaw(entity))
    if (index !== undefined && !state.rows[Math.floor(index / size)]) chunks.add(Math.floor(index / size))
  }
  try {
    await Promise.all([...chunks].map(chunk => {
      let work = state.pendingRows.get(chunk)
      if (!work) {
        work = (async () => {
          if (fast !== state) return
          const value = await fastJson(state.manifest.rows[chunk])
          state.rows[chunk] = decodeFastRows<SearchEntity & Record<string, unknown>>(value, state.ids, chunk, size)
          if (fast === state) rowsVersion.value++
          mark('rows')
        })().finally(() => state.pendingRows.delete(chunk))
        state.pendingRows.set(chunk, work)
      }
      return work
    }))
  } catch {
    if (fast === state) await startFallback()
  }
}

/** Drop the saved runtime (fast or not) and rebuild with the regular builder. */
function startFallback(): Promise<void> {
  if (fallbackBuild) return fallbackBuild
  queryRuntime = null
  fast = null
  skipSavedRuntime = true
  savedDocumentIds = null
  searchIndex.value = null
  entities.value = new Map()
  catalogueReady.value = false
  tokensReady.value = false
  suggestionTokens = null
  lastSuggestKey = null
  lastSuggestResult = []
  isLoaded.value = false
  isLoading.value = false
  const rebuild = loadSearchIndex()
  // The regular builder now owns progress; let its partial matches render.
  isQueryLoading.value = false
  fallbackBuild = rebuild
  return rebuild.finally(() => { if (fallbackBuild === rebuild) fallbackBuild = null })
}

/**
 * Load the lightweight search index
 * This is much faster than loading all source JSON-LD files
 *
 * `hint` is the query already in the URL: partition-first loading fetches its
 * partitions immediately instead of after the index is published.
 */
async function loadSearchIndex(hint = ''): Promise<void> {
  if (isLoaded.value || isLoading.value) return

  // Skip during SSR/build - data will be loaded client-side
  if (!isBrowser) {
    return
  }

  isLoading.value = true
  error.value = null
  indexedCount.value = 0

  const runtimeController = new AbortController()
  const runtimeTimeout = setTimeout(() => runtimeController.abort(), 10000)
  const savedRuntime = (async () => {
    try {
      if (skipSavedRuntime) return null
      const response = await fetch(`${API_BASE}search-runtime/index.json`, { signal: runtimeController.signal })
      return response.ok ? await response.json() : null
    } catch {
      return null
    } finally {
      clearTimeout(runtimeTimeout)
    }
  })()

  const sourceManifest = (async () => {
    const manifestResponse = await fetch(`${API_BASE}api/v1/search-index/manifest.json`)
    if (!manifestResponse.ok) {
      throw new Error(`Failed to load search index: ${manifestResponse.status}`)
    }
    return await manifestResponse.json() as unknown
  })()
  sourceManifest.catch(() => {})

  try {
    if (!skipSavedRuntime) {
      try {
        if (await loadFast(savedRuntime, sourceManifest, hint)) return
      } catch {
        // Invalid or unavailable fast assets: the regular path below decides.
        fast = null
        queryRuntime = null
        savedDocumentIds = null
        searchIndex.value = null
        isLoaded.value = false
      }
    }
    const indexBase = INDEX_BASE
    const manifest: unknown = await sourceManifest
    if (!isSearchIndexManifest(manifest)) {
      throw new Error('Failed to load search index: malformed manifest')
    }

    // Fetched in parallel, merged in orderShards' order whatever order they
    // arrive in: the merged row order decides FlexSearch's tie order, so it
    // must not depend on the network. Any failed shard fails the whole load;
    // a partial index would answer "no match" for rows it never received.
    const shards = await Promise.all(
      orderShards(manifest.shards).map(async (shard) => {
        const response = await fetch(`${indexBase}${shard.file}`)
        if (!response.ok) {
          throw new Error(`Failed to load search index shard ${shard.file}: ${response.status}`)
        }
        const bytes = await response.arrayBuffer()
        const sourceHash = globalThis.crypto?.subtle ? await searchBytesDigest(bytes).catch(() => null) : null
        const data: SearchShardResponse = JSON.parse(new TextDecoder().decode(bytes))
        if (!Array.isArray(data?.entities)) {
          throw new Error(`Failed to load search index shard ${shard.file}: no entities`)
        }
        return { entities: data.entities, signature: [shard.code, shard.file, sourceHash] }
      }),
    )
    const rows = shards.flatMap(shard => shard.entities)
    publishMetadata(manifest.metadata)

    // An optional internal build asset removes repeated index construction.
    // Bind it to the complete ordered rows and the exact application bundle;
    // stale, absent or damaged assets fall back to the existing builder below.
    try {
      const payload = await savedRuntime
      if (payload !== null && shards.every(shard => shard.signature[2] !== null)) {
        const sourceDigest = await searchBytesDigest(new TextEncoder().encode(
          JSON.stringify(shards.map(shard => shard.signature))).buffer)
        const loaded = await importSearchRuntime(payload, rows, manifest.metadata.generated,
          new URL(import.meta.url).pathname.split('/').pop() || '', async file => {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 30000)
            try {
              const response = await fetch(`${API_BASE}search-runtime/${file}`, { signal: controller.signal })
              if (!response.ok) throw new Error('Saved search index partition unavailable')
              return await response.arrayBuffer()
            } finally { clearTimeout(timeout) }
          }, sourceDigest)
        const hydrated = new Map<string, SearchEntity>()
        await forEachWithinBudget(rows, row => hydrated.set(row.id, row), {
          budgetMs: INDEX_BUDGET_MS, checkEvery: INDEX_BUDGET_CHECK_EVERY,
          now: () => performance.now(), yieldControl: yieldToEventLoop,
        })
        entities.value = hydrated
        catalogueReady.value = true
        queryRuntime = loaded
        savedDocumentIds = loaded.ids
        indexedCount.value = rows.length
        searchIndex.value = loaded.index
        isLoaded.value = true
        return
      }
    } catch {
      // Never publish a partial imported index or interpret it as "no match".
    } finally {
      runtimeController.abort()
    }
    savedDocumentIds = null
    queryRuntime = null

    // Build FlexSearch index.
    //
    // `encode` folds diacritics and splits on punctuation rather than
    // whitespace. That is what `islamsky` needs to reach "Islámský stát"
    // (0 -> 26 results, measured over this index on 2026-08-28) and what makes
    // `al-Qaida`, `al'Qaida` and `al Qaida` one pair of tokens.
    //
    // It is NOT what rescues the run-together spellings. `alqaida` 0 -> 33 and
    // `binladen` 0 -> 15 come from the glued forms `indexableText` appends to
    // the DOCUMENT below — deliberately not from the encoder, which also runs
    // on the query. Both figures are exactly the number of rows whose NAME
    // contains that string, counted directly over the live corpus. That equality
    // is the point: an earlier arrangement glued the whole joined row text and
    // returned 372 for `alqaida`, of which 339 carried no such name.
    //
    // See src/utils/searchEncode.ts for what folding deliberately does not fix:
    // `kadhafi` vs `qadhafi` is a substituted letter, which no encoder mends.
    // `suggestFor` below covers that.
    const index = createSearchIndex()

    const budget = {
      budgetMs: INDEX_BUDGET_MS,
      checkEvery: INDEX_BUDGET_CHECK_EVERY,
      now: () => performance.now(),
      yieldControl: yieldToEventLoop,
    }

    // Which ids repeat, found before any row is indexed, so `searchPartial`
    // can withhold them: a repeated id's later row replaces its earlier text,
    // so a partial match on it could stop matching. Budgeted like the build.
    const seen = new Set<string>()
    const repeated = new Set<string>()
    await forEachWithinBudget(
      rows,
      (entity) => {
        if (seen.has(entity.id)) repeated.add(entity.id)
        else seen.add(entity.id)
      },
      budget,
    )
    repeatedIds = repeated
    partialIndex = index
    let added = 0

    // Index each entity, yielding to the event loop whenever a step has used
    // up INDEX_BUDGET_MS.
    //
    // `indexableText` appends the glued forms ("alqaida" for "Al-Qaida") to the
    // document only. They must never reach the query: FlexSearch encodes the
    // query with the same function and intersects the terms, so a glued query
    // token would demand a document where those two words are adjacent — which
    // measured 426 two-word queries losing results and 340 going to zero.
    //
    // This used to be a single synchronous `forEach` over all 61k+ rows,
    // which blocked the main thread for 7.5s+ (measured live) before
    // `isLoaded` ever flipped, leaving the page unresponsive to typing or
    // the search debounce timer for that whole span. Yielding changes only
    // WHEN the event loop gets control back, never what gets built: same
    // rows, same order, same FlexSearch calls, so the resulting index and
    // its recall are identical to the unbroken version. `searchIndex` and
    // `isLoaded` are only set below, after every row is in.
    await forEachWithinBudget(
      rows,
      (entity) => {
        // Kept as a named binding: tests/birthWiring.test.js pins the literal
        // `const text = searchRowText(entity)` here, because searchRowText is
        // what carries BOTH birth-span bounds into the indexed text and a
        // future edit must not quietly route around it.
        const text = searchRowText(entity)

        // Names only for the glue; see indexableText. Gluing the whole row text
        // reached across the join into country/regime/authority.
        index.add(
          entity.id,
          indexableText(text, entity.primaryName
            ? [entity.primaryName, ...entity.names]
            : entity.names),
        )
        entities.value.set(entity.id, entity)
        added++
      },
      {
        ...budget,
        // Publish progress once per step, at the yield, never per row. A
        // watcher of it still runs before this step's task ends (Vue flushes
        // in a microtask), so SearchPage defers its partial search to a timer.
        yieldControl: () => {
          indexedCount.value = added
          triggerRef(entities)
          return yieldToEventLoop()
        },
      },
    )

    triggerRef(entities)
    indexedCount.value = added
    catalogueReady.value = true
    searchIndex.value = index
    isLoaded.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load search index'
    console.error('Failed to load search index:', e)
  } finally {
    runtimeController.abort()
    clearTimeout(runtimeTimeout)
    partialIndex = null
    repeatedIds = new Set()
    isLoading.value = false
  }
}

/** Prepare before rendering a verdict; stale requests may fill cache but cannot clear newer loading state. */
async function prepareSearch(query: string): Promise<void> {
  const version = ++queryVersion
  const runtime = queryRuntime
  if (!runtime || runtime.ready(query)) {
    isQueryLoading.value = false
    return
  }
  isQueryLoading.value = true
  try {
    await runtime.prepare(query)
  } catch {
    if (queryRuntime === runtime) {
      await startFallback()
    } else if (fallbackBuild) {
      await fallbackBuild
    }
  } finally {
    if (version === queryVersion) isQueryLoading.value = false
  }
}

/**
 * Load facet data from API
 */
async function loadFacets(): Promise<void> {
  // Skip during SSR/build
  if (!isBrowser) return

  try {
    // No countries.json. It was fetched here on every visit to the search page
    // and nothing rendered it: `countryFacets` was declared, assigned and
    // exported, and a grep for it across src/ returned only those three lines.
    // 25,808 bytes (6,430 gzipped) per search-page load for a value no
    // component reads.
    //
    // Not merely unused — currently unusable. The published facet is derived
    // from the first address line rather than a country field, so it returns
    // 644 rows in which RUSSIA (7,729), RUSSIAN FEDERATION (2,030), "RUSSIA "
    // (34) and 88 postal addresses are separate entries, and 393 rows have a
    // count of one. A filter built on it would silently miss 22% of Russia
    // matches. Restoring this fetch should wait until the gem normalises the
    // field to ISO 3166; the defect is recorded in the gem's own notes.
    const [authRes, regRes, typeRes, statusRes, listTypeRes] = await Promise.all([
      fetch(`${API_BASE}api/v1/facets/authorities.json`),
      fetch(`${API_BASE}api/v1/facets/regimes.json`),
      fetch(`${API_BASE}api/v1/facets/types.json`),
      fetch(`${API_BASE}api/v1/facets/statuses.json`),
      fetch(`${API_BASE}api/v1/facets/list_types.json`),
    ])

    if (authRes.ok) {
      const data: FacetsResponse = await authRes.json()
      authorityFacets.value = data.facets
    }

    if (regRes.ok) {
      const data: FacetsResponse = await regRes.json()
      regimeFacets.value = data.facets
    }

    if (typeRes.ok) {
      const data: FacetsResponse = await typeRes.json()
      typeFacets.value = data.facets
    }

    if (statusRes.ok) {
      const data: FacetsResponse = await statusRes.json()
      statusFacets.value = data.facets
    }

    if (listTypeRes.ok) {
      const data: FacetsResponse = await listTypeRes.json()
      listTypeFacets.value = data.facets
    }
  } catch (e) {
    console.error('Failed to load facets:', e)
  }
}

/**
 * Search entities by query. Await prepareSearch(query) before treating an empty
 * answer as a verdict; isLoaded alone describes the catalogue, not every query.
 */
function search(query: string, limit = 100): SearchEntity[] {
  // Not loaded yet: the chunked build (above) adds rows to `entities` well
  // before `searchIndex`/`isLoaded` flip, so answering from `entities` here
  // would return whatever partial, query-mismatched slice has landed so far.
  // No answer is the honest answer until the index exists.
  if (!searchIndex.value) {
    return []
  }

  if (queryRuntime && !queryRuntime.ready(query)) return []

  const state = fast
  if (state) {
    if (!query.trim()) {
      return Array.from({ length: Math.min(limit, state.ids.length) }, (_, index) => stubAt(state, index))
    }
    return (searchIndex.value.search(query, { limit }) as number[]).map(id => stubAt(state, Number(id)))
  }

  if (!query.trim()) {
    return Array.from(entities.value.values()).slice(0, limit)
  }

  const results = searchIndex.value.search(query, { limit }) as number[]

  return results
    .map((id) => entities.value.get(savedDocumentIds ? savedDocumentIds[Number(id)] : String(id)))
    .filter(Boolean) as SearchEntity[]
}

/**
 * Matches among the rows indexed SO FAR, while the build is still running.
 *
 * Separate from `search()` on purpose, so that function's guard stays exactly
 * as it is for every other caller. The answer here is incomplete by
 * construction: a caller must present it as such, and must never read an
 * empty answer as "no match" (see SearchPage.vue). Returns nothing once the
 * build has finished, when `search()` is the one to ask, and for a blank
 * query.
 *
 * Reads the rows from the raw Map. Through the reactive one, every `get` wraps
 * its row in a new reactive proxy, and a short prefix typed mid-build matches
 * tens of thousands of rows, so the wrapping would cost far more than the
 * search. Nothing is lost: the caller runs this imperatively, not inside a
 * computed, so there is no dependency to track, and a row is never mutated
 * after the build's one `set` of it.
 */
function searchPartial(query: string, limit = 100): SearchEntity[] {
  if (isLoaded.value || !partialIndex) return []
  const rows = toRaw(entities.value)
  return partialMatchIds(partialIndex, query, repeatedIds, limit)
    .map((id) => rows.get(id))
    .filter(Boolean) as SearchEntity[]
}

/**
 * Every token the index holds, folded — built on first use, never on load.
 *
 * `suggestFor` is the only caller and it only runs when a search returned
 * nothing, which is rare and is already a moment the reader is waiting. Doing
 * this eagerly would add a second full pass over 61,099 rows to every visit to
 * the search page in exchange for a list most visitors never see.
 *
 * Measured on the live corpus: roughly 67k distinct tokens of length 3 or more.
 * A length-bucketed variant of this scan was tried and removed: the reachable
 * buckets still held 50-69% of the candidates, so the saving was inside
 * measurement noise while costing a second container and a constant that had
 * to stay in step with `suggestionBudget` with nothing pinning it. The memo in
 * `suggestFor` is what actually removes the repeated cost.
 */
let suggestionTokens: Set<string> | null = null

function buildSuggestionTokens(): Set<string> {
  const tokens = new Set<string>()
  for (const entity of entities.value.values()) {
    // `foldForSearch`, deliberately, not `indexableText`: a glued form is an
    // index-matching device, never a name. Built from the glued set, the
    // suggester offered "leilabadiau" (a surname glued to a country code) and
    // "1limited" as things the reader might have meant.
    const names = entity.primaryName
      ? [entity.primaryName, ...entity.names]
      : entity.names
    for (const name of names) {
      for (const token of foldForSearch(name)) {
        // Length 3 and up. The floor is about the CANDIDATE, not the query, and
        // an earlier version excluded length-3 tokens on the grounds that
        // `suggestionBudget` returns 0 for a three-character QUERY — a different
        // thing. A four-character query has a budget of 1 and can legitimately
        // reach a three-character name, so excluding them meant `kimm` never
        // suggested `kim` and `alii` never suggested `ali`. Below 3 the budget
        // is 0 from either side, so nothing there can ever match.
        if (token.length >= 3) tokens.add(token)
      }
    }
  }
  return tokens
}

/**
 * The indexed names a query nearly matched.
 *
 * This exists so the empty state can stop asserting a negative. On the live
 * site `kadhafi` returned 1 result, `gaddafi` 15 and `qadhafi` 79 — three
 * spellings of one man — and nothing on the page told the reader the other
 * two existed. Against the real token set this returns, for `kadhafi`:
 * gadhafi, kaddafi, qadhafi. For a name genuinely absent from the corpus
 * ("ceausescu") it correctly returns nothing rather than inventing a lead.
 */
/** Memo key: the query AND the limit, since both shape the result. */
let lastSuggestKey: string | null = null
let lastSuggestResult: NearMiss[] = []

function suggestFor(query: string, limit = 5): NearMiss[] {
  if (!isLoaded.value || !query.trim()) return []
  // Partition-first: the candidates come from the build's token list or the catalogue.
  if (!suggestionsReady.value) return []

  // Memoized on the query string. The caller is a Vue computed, which
  // re-evaluates whenever any of its other dependencies change — a filter
  // toggle, a pagination reset — and each miss costs a pass over the candidate
  // set. Without this, changing a facet while the grid is empty rescanned tens
  // of thousands of tokens for a query that had not changed.
  const key = `${limit}\u0000${query}`
  if (key === lastSuggestKey) return lastSuggestResult

  if (suggestionTokens === null) suggestionTokens = buildSuggestionTokens()
  lastSuggestKey = key
  lastSuggestResult = nearestNames(query, suggestionTokens, limit)
  return lastSuggestResult
}

/**
 * Filter entities by criteria
 */
function filter(
  entityList: SearchEntity[],
  filters: SearchFilterSelection,
): SearchEntity[] {
  return filterSearchEntities(entityList, filters)
}

/**
 * Get entity by ID
 */
function getEntity(id: string): SearchEntity | undefined {
  return entities.value.get(id)
}

/**
 * Get entity by reference (e.g., "un/KPi.066")
 */
function getEntityByRef(ref: string): SearchEntity | undefined {
  // Find entity with matching ref
  for (const entity of entities.value.values()) {
    if (entity.ref === ref) {
      return entity
    }
  }
  return undefined
}

/**
 * Load full entity data from node file
 * @param idOrRef - Either a ref (uk/aqd0087) or full IRI (https://www.ammitto.org/entity/uk/aqd0087)
 */
async function loadFullEntity(idOrRef: string): Promise<Record<string, unknown> | null> {
  // Skip during SSR/build
  if (!isBrowser) return null

  try {
    // getEntityNodePath extracts the ref from a full IRI itself, and is
    // the same call EntityPage makes to build the link it offers. It
    // returns null for a ref that cannot address a document -- an empty
    // or dot segment -- and there is nothing to fetch in that case.
    const path = getEntityNodePath(idOrRef, API_BASE)
    if (!path) return null

    const response = await fetch(path)

    if (!response.ok) {
      throw new Error(`Failed to load entity: ${response.status}`)
    }

    // Entity nodes arrive in the producer's JSON-LD vocabulary
    return normalizeNode(await response.json())
  } catch (e) {
    console.error(`Failed to load entity ${idOrRef}:`, e)
    return null
  }
}

/**
 * Composable for search index access
 */
export function useSearchIndex() {
  // Deliberately does NOT start loading here.
  //
  // Constructing the composable used to kick off the search index, the
  // whole corpus, on first use. `useEntityData` calls this to reach
  // `loadFullEntity`, so opening any entity page downloaded it and then
  // read nothing from it: `loadFullEntity` derives the ref from the IRI
  // and fetches that node file directly.
  //
  // The search page calls `loadSearchIndex` and `loadFacets` itself on
  // mount, so the page that needs the index still gets it, while every
  // other page stops paying for it.

  // Each is valid or 0, never a raw metadata value: see `checkMetadata`.
  const totalEntities = computed(() => metadata.value?.totalEntities ?? 0)
  const sourceCount = computed(() => metadata.value?.sources ?? 0)
  /**
   * When the published data was generated, as an ISO string, or '' when the
   * index did not carry a plausible one.
   *
   * The empty state needs it: "no entity matches X" is only true as of a
   * date, and a screening result without one cannot be filed.
   */
  const generatedAt = computed(() => metadata.value?.generated || '')

  return {
    // State
    isLoading,
    isQueryLoading,
    isLoaded,
    indexedCount,
    error,
    totalEntities,
    sourceCount,
    generatedAt,

    // Facets
    authorityFacets,
    regimeFacets,
    typeFacets,
    statusFacets,
    listTypeFacets,

    // Methods
    loadSearchIndex,
    prepareSearch,
    loadFacets,
    search,
    searchPartial,
    suggestFor,
    filter,
    getEntity,
    getEntityByRef,
    loadFullEntity,
    rowFor,
    ensureRows,
    rowsVersion,
    suggestionsReady,
    loadSuggestions,

    // Direct access
    entities,
  }
}
