/* Generated with an exact, bounded list of this build's immutable static assets.
 * No document or data fallback: sanctions/API requests always use the network
 * as far as this worker is concerned. (The search page separately keeps
 * content-addressed search assets in its own Cache API store; see README.)
 */
const ASSETS = new Map(__AMMITTO_ASSETS__)
const CACHE_NAME = '__AMMITTO_CACHE_NAME__'
const OWN_CACHE = /^ammitto-static-v1-[a-f0-9]{64}$/

// Deliberately no skipWaiting, clients.claim, reload, or install-time prefetch.
// Updates wait for existing tabs to close, preserving each tab's running code.
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(
    names.filter((name) => OWN_CACHE.test(name) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)),
  )))
})

function allowedAsset(request) {
  if (request.method !== 'GET' || request.mode === 'navigate') return undefined
  if (request.destination === 'document' || request.headers.has('range')) return undefined
  if (['no-store', 'reload', 'no-cache'].includes(request.cache)) return undefined
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.search || url.hash) return undefined
  return ASSETS.get(url.pathname)
}

async function cacheResponse(url, response, asset) {
  if (response.status !== 200 || response.redirected) return
  if (!['basic', 'default'].includes(response.type)) return
  if (/\b(no-store|private)\b/i.test(response.headers.get('cache-control') || '')) return
  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  if (!asset.types.includes(contentType) || !response.body) return
  const declaredLength = response.headers.get('content-length')
  // Fetch decodes gzip/br bodies; their HTTP length describes encoded bytes.
  if (!response.headers.get('content-encoding') && declaredLength !== null && Number(declaredLength) !== asset.bytes) return

  // Read with a hard limit, even when the server omits Content-Length. Verify
  // the build digest too: an HTML fallback or replaced file is never persisted.
  const reader = response.clone().body.getReader()
  const chunks = []
  let bytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > asset.bytes) {
      void reader.cancel().catch(() => {})
      return
    }
    chunks.push(value)
  }
  if (bytes !== asset.bytes) return
  const body = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', body)),
    (byte) => byte.toString(16).padStart(2, '0')).join('')
  if (digest !== asset.digest) return

  const cache = await caches.open(CACHE_NAME)
  // Canonical URL keys and a finite manifest bound both entries and bytes,
  // including concurrent requests with different request headers.
  await cache.put(url, new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  }))
}

async function respond(event, asset) {
  try {
    const cache = await caches.open(CACHE_NAME)
    const cached = await cache.match(event.request.url)
    if (cached) return cached
  } catch { /* Storage unavailable: continue through the network. */ }
  const response = await fetch(event.request)
  event.waitUntil(cacheResponse(event.request.url, response, asset).catch(() => {}))
  return response
}

self.addEventListener('fetch', (event) => {
  const asset = allowedAsset(event.request)
  if (asset) event.respondWith(respond(event, asset))
})
