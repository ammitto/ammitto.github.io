/**
 * The search index as the gem publishes it: `search-index/manifest.json`
 * naming one shard file per authority, each with the monolithic file's old
 * `{metadata, entities}` shape.
 *
 * Pure, with no `vue` or `fetch`, so the unit tests run it on plain Node.
 */

/** One shard as the manifest lists it; `file` is relative to the manifest. */
export interface SearchShardRef {
  code: string
  file: string
  count: number
}

export interface SearchIndexMetadata {
  generated: string
  totalEntities: number
  sources: number
}

export interface SearchIndexManifest {
  metadata: SearchIndexMetadata
  shards: SearchShardRef[]
}

/**
 * The order shards are merged in: the authority order of deploy.yml's
 * harmonize invocation, which is the row order of the single file the gem
 * published before it sharded the index.
 *
 * The order is load-bearing. FlexSearch breaks ties between equally scored
 * matches by insertion order, so merging in the manifest's alphabetical
 * order would reorder results for the same rows. Keeping this list equal to
 * the harmonize arguments keeps every result order what it was;
 * tests/searchShards.test.js holds the two in step.
 */
export const SEARCH_SHARD_ORDER: readonly string[] = [
  'eu', 'un', 'wb', 'uk', 'au', 'ca', 'cn', 'ru', 'tr', 'nz', 'jp',
  'eu_vessels', 'un_vessels', 'us', 'ch',
]

/**
 * The manifest's shards in merge order.
 *
 * A shard whose code the list does not know still loads, after the known
 * ones and in the manifest's own order, so a newly published authority is
 * searchable before this list learns of it rather than silently missing.
 */
export function orderShards(shards: ReadonlyArray<SearchShardRef>): SearchShardRef[] {
  const rank = (code: string) => {
    const index = SEARCH_SHARD_ORDER.indexOf(code)
    return index === -1 ? SEARCH_SHARD_ORDER.length : index
  }
  // Array.prototype.sort is stable, which is what keeps unknown codes in
  // manifest order.
  return [...shards].sort((a, b) => rank(a.code) - rank(b.code))
}

/**
 * Whether a parsed manifest has the shape the loader relies on. A shard
 * `file` must be a bare name, so a manifest can never point a fetch outside
 * the search-index directory.
 */
export function isSearchIndexManifest(value: unknown): value is SearchIndexManifest {
  if (!value || typeof value !== 'object') return false
  const { metadata, shards } = value as Partial<SearchIndexManifest>
  if (!metadata || typeof metadata !== 'object') return false
  if (!Array.isArray(shards) || shards.length === 0) return false
  return shards.every((shard) =>
    shard !== null &&
    typeof shard === 'object' &&
    typeof shard.code === 'string' &&
    typeof shard.file === 'string' &&
    /^[a-z0-9_-]+\.json$/.test(shard.file))
}
