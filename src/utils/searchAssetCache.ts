/**
 * Persistent, verified cache for content-addressed search assets.
 *
 * Entries live in the Cache API under a key that embeds the asset's SHA-256,
 * so a new build can never be answered by an old entry: a changed asset has a
 * different address. Every read is re-hashed; a damaged or truncated entry is
 * deleted and the asset is fetched from the network instead. Any storage
 * failure (no Cache API, quota, eviction, private mode) silently degrades to
 * the network.
 */
import { searchBytesDigest } from './searchRuntime.js'

export const SEARCH_ASSET_CACHE = 'ammitto-search-assets-v1'

export interface CacheStore {
  open(name: string): Promise<{
    match(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | undefined>
    put(key: string, response: Response): Promise<void>
    delete(key: string): Promise<boolean>
    keys(): Promise<ReadonlyArray<{ url: string }>>
  }>
}

const defaultStore = (): CacheStore | null => {
  try {
    return typeof caches !== 'undefined' && globalThis.isSecureContext !== false ? caches as unknown as CacheStore : null
  } catch { return null }
}

/** The cache key: the URL with the content address appended, so stale entries can never match. */
export function searchAssetKey(url: string, sha256: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}sha256=${sha256}`
}

/**
 * Bytes of `url` whose SHA-256 is `sha256` and length is `bytes`, from the
 * cache when a verified copy exists, else from `network` (verified, then
 * stored in the background). Throws only when the network copy is wrong or
 * unavailable.
 */
export async function fetchVerifiedAsset(
  url: string,
  sha256: string,
  bytes: number,
  network: (url: string) => Promise<ArrayBuffer>,
  store: CacheStore | null = defaultStore(),
): Promise<ArrayBuffer> {
  const key = searchAssetKey(url, sha256)
  if (store) {
    try {
      const cache = await store.open(SEARCH_ASSET_CACHE)
      const hit = await cache.match(key)
      if (hit) {
        const body = await hit.arrayBuffer()
        if (body.byteLength === bytes && await searchBytesDigest(body) === sha256) return body
        await cache.delete(key).catch(() => false)
      }
    } catch { /* Storage unavailable: use the network. */ }
  }
  const body = await network(url)
  if (body.byteLength !== bytes || await searchBytesDigest(body) !== sha256) throw new Error('Search asset failed verification')
  if (store) {
    void (async () => {
      const cache = await store.open(SEARCH_ASSET_CACHE)
      await cache.put(key, new Response(body.slice(0)))
    })().catch(() => {})
  }
  return body
}

/** Remove entries the current manifest no longer references. Failures are ignored. */
export async function pruneSearchAssets(keep: ReadonlySet<string>, store: CacheStore | null = defaultStore()): Promise<number> {
  if (!store) return 0
  try {
    const cache = await store.open(SEARCH_ASSET_CACHE)
    let removed = 0
    for (const request of await cache.keys()) {
      if (!keep.has(request.url) && await cache.delete(request.url)) removed++
    }
    return removed
  } catch { return 0 }
}
