import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, webcrypto } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import { CACHE_LIMITS, generateServiceWorker } from '../scripts/generate-service-worker.js'

const ORIGIN = 'https://www.ammitto.test'
const ASSET = '/assets/app-abcdefgh.js'
const BODY = 'export const ready = true'
const digest = (value) => createHash('sha256').update(value).digest('hex')
const CURRENT = `ammitto-static-v1-${'a'.repeat(64)}`
const OLD = `ammitto-static-v1-${'b'.repeat(64)}`
const template = readFileSync(new URL('../scripts/service-worker.js', import.meta.url), 'utf8')
const source = template.replace('__AMMITTO_ASSETS__', JSON.stringify([
  [ASSET, { bytes: Buffer.byteLength(BODY), digest: digest(BODY), types: ['text/javascript', 'application/javascript'] }],
])).replace('__AMMITTO_CACHE_NAME__', CURRENT)

function harness({ response = () => new Response(BODY, { headers: { 'content-type': 'text/javascript' } }), storageFails = false } = {}) {
  const listeners = new Map()
  const stores = new Map()
  const network = []
  const deleted = []
  let forcedActivation = 0
  const caches = {
    async keys() { return [...stores.keys()] },
    async delete(name) { deleted.push(name); return stores.delete(name) },
    async open(name) {
      if (storageFails) throw new Error('storage unavailable')
      if (!stores.has(name)) stores.set(name, new Map())
      const store = stores.get(name)
      return {
        async match(url) { return store.get(url)?.clone() },
        async put(url, value) { store.set(url, value.clone()) },
      }
    },
  }
  vm.runInNewContext(source, {
    self: {
      location: { origin: ORIGIN },
      addEventListener: (name, listener) => listeners.set(name, listener),
      skipWaiting: () => { forcedActivation++ },
      clients: { claim: () => { forcedActivation++ } },
    },
    caches, crypto: webcrypto, URL, Response, Uint8Array,
    fetch: async (request) => { network.push(request.url); return response(request) },
  })
  async function request(path = ASSET, overrides = {}) {
    const pending = []
    let handled
    listeners.get('fetch')({
      request: { url: new URL(path, ORIGIN).href, method: 'GET', mode: 'cors', destination: 'script', cache: 'default', headers: new Headers(), ...overrides },
      respondWith(value) { handled = value },
      waitUntil(value) { pending.push(value) },
    })
    const result = handled ? await handled : undefined
    await Promise.all(pending)
    return result
  }
  async function activate() {
    let pending
    listeners.get('activate')({ waitUntil(value) { pending = value } })
    await pending
  }
  return { request, activate, stores, network, deleted, listeners, forced: () => forcedActivation }
}

test('only exact manifest assets are cached, then reused without another network request', async () => {
  const worker = harness()
  assert.equal(await (await worker.request()).text(), BODY)
  assert.equal(await (await worker.request()).text(), BODY)
  assert.equal(worker.network.length, 1)
  assert.deepEqual([...worker.stores.get(CURRENT).keys()], [ORIGIN + ASSET])
})

test('concurrent requests use one canonical cache key with the exact built byte size', async () => {
  const worker = harness()
  await Promise.all(Array.from({ length: 20 }, (_, index) => worker.request(ASSET, {
    headers: new Headers({ 'x-request': String(index) }),
  })))
  const store = worker.stores.get(CURRENT)
  assert.equal(store.size, 1)
  assert.equal((await store.get(ORIGIN + ASSET).arrayBuffer()).byteLength, Buffer.byteLength(BODY))
})

test('compressed HTTP length does not reject a correctly decoded and hashed asset', async () => {
  const worker = harness({ response: () => new Response(BODY, { headers: {
    'content-type': 'text/javascript', 'content-encoding': 'gzip', 'content-length': '10',
  } }) })
  await worker.request()
  await worker.request()
  assert.equal(worker.network.length, 1)
  assert.equal(worker.stores.get(CURRENT).size, 1)
})

test('all data, documents, downloads, queries, external and nonimmutable requests bypass the worker', async () => {
  const worker = harness()
  for (const path of [
    '/', '/index.html', '/404.html', '/search', '/entity/cn/1',
    '/api/v1/stats.json', '/api/v1/search-index/cn.json', '/api/v1/node/entity/cn/1.jsonld',
    '/api/v1/all.ttl', '/openapi.json', '/queries/active-cn-entries.rq', '/schemas/context.jsonld',
    '/assets/ammitto-logo_full.svg', '/assets/entity-abcdefgh.json', '/assets/missing-abcdefgh.js',
    `${ASSET}?download=1`, `${ASSET}#fragment`, `https://external.test${ASSET}`,
  ]) assert.equal(await worker.request(path), undefined, path)
  for (const overrides of [
    { method: 'POST' }, { method: 'HEAD' }, { mode: 'navigate' }, { destination: 'document' },
    { cache: 'no-store' }, { cache: 'reload' }, { cache: 'no-cache' },
    { headers: new Headers({ range: 'bytes=0-10' }) },
  ]) assert.equal(await worker.request(ASSET, overrides), undefined, JSON.stringify(overrides))
  assert.equal(worker.network.length, 0)
  assert.equal(worker.stores.size, 0)
})

test('wrong status, MIME, policy, length and content never enter the cache', async () => {
  const responses = [
    () => new Response(BODY, { status: 404, headers: { 'content-type': 'text/javascript' } }),
    () => new Response(BODY, { headers: { 'content-type': 'text/html' } }),
    () => new Response(BODY, { headers: { 'content-type': 'application/json' } }),
    () => new Response(BODY, { headers: { 'content-type': 'text/javascript', 'cache-control': 'private' } }),
    () => new Response(BODY, { headers: { 'content-type': 'text/javascript', 'cache-control': 'no-store' } }),
    () => new Response(BODY, { headers: { 'content-type': 'text/javascript', 'content-length': '999' } }),
    () => new Response(BODY + 'oversized', { headers: { 'content-type': 'text/javascript' } }),
    () => new Response(BODY.slice(0, -1), { headers: { 'content-type': 'text/javascript' } }),
    () => new Response(BODY.replace('true', 'evil'), { headers: { 'content-type': 'text/javascript' } }),
    () => new Response(BODY + 'oversized', { headers: { 'content-type': 'text/javascript', 'content-encoding': 'gzip', 'content-length': '10' } }),
    () => new Response(BODY.replace('true', 'evil'), { headers: { 'content-type': 'text/javascript', 'content-encoding': 'gzip', 'content-length': '10' } }),
    () => flaggedResponse('redirected', true),
    () => flaggedResponse('type', 'opaque'),
  ]
  for (const response of responses) {
    const worker = harness({ response })
    await worker.request()
    assert.equal(worker.stores.get(CURRENT)?.size || 0, 0)
  }
})

test('a response rejected by headers is not cloned into an unread stream', async () => {
  const response = new Response('<html>fallback</html>', { headers: { 'content-type': 'text/html' } })
  response.clone = () => { throw new Error('rejected response must not be cloned') }
  const worker = harness({ response: () => response })
  assert.equal(await (await worker.request()).text(), '<html>fallback</html>')
  assert.equal(worker.stores.get(CURRENT).size, 0)
})

function flaggedResponse(property, flag) {
  const response = new Response(BODY, { headers: { 'content-type': 'text/javascript' } })
  Object.defineProperty(response, property, { value: flag })
  // Node's Response clones do not copy test-defined properties; browsers
  // preserve the native redirected/type flags on a clone.
  response.clone = () => {
    const clone = new Response(BODY, { headers: response.headers })
    Object.defineProperty(clone, property, { value: flag })
    return clone
  }
  return response
}

function writeManifest(dist, files) {
  mkdirSync(join(dist, '.vite'), { recursive: true })
  writeFileSync(join(dist, '.vite/manifest.json'), JSON.stringify(Object.fromEntries(
    files.map((name) => [name, { file: `assets/${name}` }]),
  )))
}

test('network and storage failures do not invent an offline data or document fallback', async () => {
  const noStorage = harness({ storageFails: true })
  assert.equal(await (await noStorage.request()).text(), BODY)
  const offline = harness({ response: () => { throw new TypeError('offline') } })
  await assert.rejects(offline.request(), /offline/)
  assert.equal(await offline.request('/api/v1/all.jsonld'), undefined)
  assert.equal(await offline.request('/index.html'), undefined)
})

test('natural activation removes only prior version caches owned by this worker', async () => {
  const worker = harness()
  for (const name of [CURRENT, OLD, 'another-app', 'ammitto-static-v1-other-application']) worker.stores.set(name, new Map())
  await worker.activate()
  assert.deepEqual(worker.deleted, [OLD])
  assert.deepEqual([...worker.stores.keys()], [CURRENT, 'another-app', 'ammitto-static-v1-other-application'])
  assert.equal(worker.forced(), 0)
  assert.equal(worker.listeners.has('install'), false, 'installation performs no eager downloads or forced activation')
  assert.equal(worker.listeners.has('message'), false, 'no message can force a waiting update')
})

test('generator uses only hashed static assets and content versions change with the built bytes', () => {
  const dist = mkdtempSync(join(tmpdir(), 'ammitto-worker-test-'))
  try {
    mkdirSync(join(dist, 'assets'))
    for (const name of ['app-abcdefgh.js', 'style-12345678.css', 'font-abcd1234.woff2', 'photo-abcd1234.webp', 'dollar$&-abcdefgh.js', 'records-abcd1234.json', 'ammitto-logo_full.svg', 'page-12345678.html']) writeFileSync(join(dist, 'assets', name), BODY)
    writeManifest(dist, ['app-abcdefgh.js', 'style-12345678.css', 'font-abcd1234.woff2', 'photo-abcd1234.webp', 'dollar$&-abcdefgh.js', 'records-abcd1234.json', 'page-12345678.html'])
    writeFileSync(join(dist, 'openapi.json'), '{}')
    const first = generateServiceWorker(dist)
    assert.equal(first.assets.length, 5)
    assert.equal(first.bytes, Buffer.byteLength(BODY) * 5)
    assert.equal(generateServiceWorker(dist).version, first.version)
    writeFileSync(join(dist, 'assets/app-abcdefgh.js'), BODY + ';')
    assert.notEqual(generateServiceWorker(dist).version, first.version)
    assert.match(readFileSync(join(dist, 'service-worker.js'), 'utf8'), /const ASSETS = new Map\(\[/)
    assert.ok(readFileSync(join(dist, 'service-worker.js'), 'utf8').includes('/assets/dollar$&-abcdefgh.js'))
  } finally { rmSync(dist, { recursive: true }) }
})

test('generator admits Astro dot-hash output only when the build manifest names it', () => {
  const dist = mkdtempSync(join(tmpdir(), 'ammitto-astro-worker-'))
  try {
    mkdirSync(join(dist, 'assets'))
    writeFileSync(join(dist, 'assets/SearchPage.Dc123456.js'), BODY)
    writeFileSync(join(dist, 'assets/public-lookalike.Dc123456.js'), BODY)
    writeManifest(dist, ['SearchPage.Dc123456.js'])
    const result = generateServiceWorker(dist)
    assert.deepEqual(result.assets.map(([path]) => path), ['/assets/SearchPage.Dc123456.js'])
  } finally { rmSync(dist, { recursive: true }) }
})

test('Astro captured client manifest supplies provenance after Vite manifest cleanup', () => {
  const dist = mkdtempSync(join(tmpdir(), 'ammitto-astro-manifest-'))
  try {
    mkdirSync(join(dist, 'assets'))
    writeFileSync(join(dist, 'assets/SearchPage.Dc123456.js'), BODY)
    writeFileSync(join(dist, 'assets/public-lookalike.Dc123456.js'), BODY)
    const path = join(dist, 'ammitto-static-assets.json')
    writeFileSync(path, JSON.stringify({ version: 1, files: ['assets/SearchPage.Dc123456.js', 'assets/inlined.Dc123456.js'] }))
    assert.deepEqual(generateServiceWorker(dist).assets.map(([path]) => path), ['/assets/SearchPage.Dc123456.js'])
    writeFileSync(path, JSON.stringify({ version: 1, files: ['assets/../secret.js'] }))
    assert.throws(() => generateServiceWorker(dist), /Invalid captured Astro client asset manifest/)
  } finally { rmSync(dist, { recursive: true }) }
})

test('generator imposes entry, per-file and aggregate byte limits before shipping its manifest', () => {
  const dist = mkdtempSync(join(tmpdir(), 'ammitto-worker-bound-test-'))
  try {
    mkdirSync(join(dist, 'assets'))
    for (let index = 0; index < CACHE_LIMITS.entries + 10; index++) writeFileSync(join(dist, `assets/app${index}-abcdefgh.js`), BODY)
    writeFileSync(join(dist, 'assets/large-abcdefgh.js'), Buffer.alloc(CACHE_LIMITS.assetBytes + 1))
    writeManifest(dist, [...Array.from({ length: CACHE_LIMITS.entries + 10 }, (_, index) => `app${index}-abcdefgh.js`), 'large-abcdefgh.js'])
    assert.equal(generateServiceWorker(dist).assets.length, CACHE_LIMITS.entries)
    // Separate fixture proves bytes, rather than just the entry count, stop growth.
    const big = mkdtempSync(join(tmpdir(), 'ammitto-worker-bytes-test-'))
    try {
      mkdirSync(join(big, 'assets'))
      for (let index = 0; index < 12; index++) writeFileSync(join(big, `assets/app${index}-abcdefgh.js`), Buffer.alloc(CACHE_LIMITS.assetBytes))
      writeManifest(big, Array.from({ length: 12 }, (_, index) => `app${index}-abcdefgh.js`))
      const result = generateServiceWorker(big)
      assert.equal(result.bytes, CACHE_LIMITS.totalBytes)
      assert.equal(result.assets.length, CACHE_LIMITS.totalBytes / CACHE_LIMITS.assetBytes)
    } finally { rmSync(big, { recursive: true }) }
  } finally { rmSync(dist, { recursive: true }) }
})

test('registration is SSR safe, secure-client only, delayed until load, and never reloads', async () => {
  const utility = readFileSync(new URL('../src/utils/registerServiceWorker.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(utility, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const evaluate = (globals = {}) => {
    const exports = {}
    vm.runInNewContext(compiled, { exports, ...globals })
    return exports.registerServiceWorker
  }
  assert.doesNotThrow(() => evaluate()())
  const calls = []
  let onLoad
  const window = { isSecureContext: true, addEventListener(name, listener, options) {
    assert.equal(name, 'load')
    assert.equal(options.once, true)
    onLoad = listener
  } }
  const navigator = { serviceWorker: { register: (...args) => { calls.push(args); return Promise.resolve() } } }
  evaluate({ window: { ...window, isSecureContext: false }, navigator })()
  evaluate({ window, navigator: {} })()
  assert.equal(calls.length, 0)
  evaluate({ window, navigator, document: { readyState: 'loading' } })('/site/')
  assert.equal(calls.length, 0)
  onLoad()
  assert.equal(calls[0][0], '/site/service-worker.js')
  assert.equal(calls[0][1].scope, '/site/')
  assert.equal(calls[0][1].updateViaCache, 'none')
  evaluate({ window, navigator, document: { readyState: 'complete' } })()
  assert.equal(calls.length, 2)
  const layout = readFileSync(new URL('../src/layouts/BaseLayout.astro', import.meta.url), 'utf8')
  assert.match(layout, /registerServiceWorker\(/)
})
