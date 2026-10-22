/**
 * Partition-first search data ("fast assets").
 *
 * The saved runtime manifest (search-runtime/index.json, format v4) may carry
 * a `fast` block naming three kinds of content-addressed, gzip-compressed
 * assets, all generated from the exact API shard bytes the build shipped:
 *
 * - `ids`: the ordered entity ids. Position = the runtime's numeric doc ID.
 * - `columns`: every row field a facet filter reads, dictionary-encoded in
 *   doc-ID order, so a query can be searched, filtered and counted exactly
 *   without the catalogue.
 * - `rows`: the entity rows themselves in doc-ID order, in fixed-size chunks,
 *   so only the chunks holding the visible cards are fetched.
 *
 * For a duplicated id the LAST row wins and keeps the FIRST row's position,
 * which is what `Map.set` over the merged shard rows produced before.
 *
 * Pure: no `vue`, no `fetch`.
 */

/** Every field `filterSearchEntities` reads besides `type`. */
export const FAST_FILTER_FIELDS = ['type', 'authority', 'regime', 'status', 'country', 'listType'] as const
export type FastField = typeof FAST_FILTER_FIELDS[number]
export const FAST_ROW_CHUNK = 128
const MAX_ASSET_BYTES = 64 * 1024 * 1024

export interface FastAsset { file: string; sha256: string; bytes: number; decodedBytes: number }
export interface FastSource { code: string; file: string; count: number; sha256: string; bytes: number }
export interface FastManifest {
  rowChunk: number
  ids: FastAsset
  columns: FastAsset
  rows: FastAsset[]
  sources: FastSource[]
}
export interface FastColumns { dict: Record<FastField, string[]>; codes: Record<FastField, number[]> }
type Row = { id: string } & Record<string, unknown>

const dictionary = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
function fail(): never { throw new Error('Incompatible saved search index') }

/** Rows in doc-ID order: first occurrence decides the position, the last row the content. */
export function fastDocuments<T extends Row>(rows: readonly T[]): T[] {
  const byId = new Map<string, T>()
  for (const row of rows) byId.set(row.id, row)
  return [...byId.values()]
}

/** Dictionary-encode the filter fields; null when a value is not a string (the fast path is then not emitted). */
export function encodeFastColumns(docs: readonly Row[]): FastColumns | null {
  const dict = {} as Record<FastField, string[]>
  const codes = {} as Record<FastField, number[]>
  for (const field of FAST_FILTER_FIELDS) {
    const values = new Map<string, number>()
    const column: number[] = []
    for (const doc of docs) {
      const value = doc[field]
      if (value === undefined) { column.push(-1); continue }
      if (typeof value !== 'string') return null
      let code = values.get(value)
      if (code === undefined) { code = values.size; values.set(value, code) }
      column.push(code)
    }
    dict[field] = [...values.keys()]
    codes[field] = column
  }
  return { dict, codes }
}

export function decodeFastColumns(value: unknown, count: number): FastColumns {
  if (!dictionary(value) || !dictionary(value.dict) || !dictionary(value.codes)) fail()
  for (const field of FAST_FILTER_FIELDS) {
    const dict = value.dict[field]
    const codes = value.codes[field]
    if (!Array.isArray(dict) || dict.some(entry => typeof entry !== 'string') || new Set(dict).size !== dict.length
      || !Array.isArray(codes) || codes.length !== count
      || codes.some(code => !Number.isSafeInteger(code) || code < -1 || code >= dict.length)) fail()
  }
  return value as unknown as FastColumns
}

/** The filterable fields of doc `index`, absent where the row had none. */
export function fastFilterFields(columns: FastColumns, index: number): Partial<Record<FastField, string>> {
  const fields: Partial<Record<FastField, string>> = {}
  for (const field of FAST_FILTER_FIELDS) {
    const code = columns.codes[field][index]
    if (code >= 0) fields[field] = columns.dict[field][code]
  }
  return fields
}

function asset(value: unknown): FastAsset {
  if (!dictionary(value) || typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256)
    || value.file !== `${value.sha256}.bin` || !integer(value.bytes) || value.bytes < 1 || value.bytes > MAX_ASSET_BYTES
    || !integer(value.decodedBytes) || value.decodedBytes < 2 || value.decodedBytes > MAX_ASSET_BYTES) fail()
  return value as unknown as FastAsset
}

export function validateFastManifest(value: unknown, entityCount: number): FastManifest {
  if (!dictionary(value) || value.rowChunk !== FAST_ROW_CHUNK || !Array.isArray(value.rows)
    || value.rows.length !== Math.ceil(entityCount / FAST_ROW_CHUNK) || !Array.isArray(value.sources)
    || value.sources.length === 0) fail()
  asset(value.ids)
  asset(value.columns)
  value.rows.forEach(asset)
  for (const source of value.sources) {
    if (!dictionary(source) || typeof source.code !== 'string' || typeof source.file !== 'string'
      || !/^[a-z0-9_-]+\.json$/.test(source.file) || !integer(source.count) || !integer(source.bytes)
      || source.bytes < 1 || source.bytes > 1024 * 1024 * 1024 || typeof source.sha256 !== 'string'
      || !/^[a-f0-9]{64}$/.test(source.sha256)) fail()
  }
  return value as unknown as FastManifest
}

/** Ids: unique strings, exactly `count` of them. */
export function decodeFastIds(value: unknown, count: number): string[] {
  if (!Array.isArray(value) || value.length !== count || value.some(id => typeof id !== 'string')
    || new Set(value).size !== count) fail()
  return value as string[]
}

/** One row chunk: `expected` rows whose ids equal the ordered ids of that chunk. */
export function decodeFastRows<T extends Row>(value: unknown, ids: readonly string[], chunk: number, size = FAST_ROW_CHUNK): T[] {
  const start = chunk * size
  const expected = Math.min(size, ids.length - start)
  if (!Array.isArray(value) || expected < 1 || value.length !== expected) fail()
  value.forEach((row, offset) => {
    if (!dictionary(row) || row.id !== ids[start + offset] || !Array.isArray(row.names)) fail()
  })
  return value as T[]
}

const NO_NAMES: string[] = Object.freeze([]) as unknown as string[]

/**
 * Search results for the partition-first path: one tiny object per doc whose
 * filter fields are read from the columns on access, so blank browsing over
 * the whole catalogue allocates one field per result rather than copying six.
 * `index` is the doc ID; `rowOf` maps it to its row chunk.
 */
export function fastResults(ids: readonly string[], columns: FastColumns) {
  const { dict, codes } = columns
  const read = (field: FastField, index: number) => {
    const code = codes[field][index]
    return code >= 0 ? dict[field][code] : undefined
  }
  class FastResult {
    constructor(readonly index: number) {}
    get id() { return ids[this.index] }
    get ref() { return '' }
    get names() { return NO_NAMES }
    get type() { return read('type', this.index) as string }
    get authority() { return read('authority', this.index) }
    get regime() { return read('regime', this.index) }
    get status() { return read('status', this.index) }
    get country() { return read('country', this.index) }
    get listType() { return read('listType', this.index) }
  }
  const cache: (FastResult | undefined)[] = new Array(ids.length)
  return {
    at: (index: number) => (cache[index] ??= new FastResult(index)),
    indexOf: (value: unknown) => (value instanceof FastResult ? value.index : undefined),
  }
}
