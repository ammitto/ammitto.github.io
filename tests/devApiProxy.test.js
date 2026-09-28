/**
 * The dev server's /api/v1/ handler (scripts/dev-api-proxy.js), driven with
 * real sockets: a stub upstream on loopback plays the live site, over plain
 * http through the injectable `request` so no certificate is needed. What
 * differs from production is only the transport, not the handler's logic.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  SITE_ORIGIN, createApiHandler, forwardableHeaders, resolveLiveOrigin,
} from '../scripts/dev-api-proxy.js'

const apiRoot = mkdtempSync(join(tmpdir(), 'dev-api-proxy-'))
mkdirSync(join(apiRoot, 'facets'))
writeFileSync(join(apiRoot, 'stats.json'), '{"local":true}')

const servers = []
after(() => { for (const s of servers) s.closeAllConnections?.(); for (const s of servers) s.close() })

function listen(handler) {
  const server = http.createServer(handler)
  servers.push(server)
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
}

/** The dev side: strips the mount like connect does, and records next(). */
async function devServer(options) {
  const handler = createApiHandler({ apiRoot, request: http.request, ...options })
  return listen((req, res) => {
    req.url = req.url.slice('/api/v1'.length) || '/'
    handler(req, res, () => { res.statusCode = 299; res.end('next') })
  })
}

function get(port, path, { abortAfterMs } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (c) => { body += c })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body, complete: res.complete }))
      res.on('error', () => resolve({ status: res.statusCode, headers: res.headers, body, complete: false }))
    })
    req.on('error', reject)
    if (abortAfterMs) setTimeout(() => { req.destroy(); resolve(null) }, abortAfterMs)
  })
}

test('a local file is left to Vite, live or not', async () => {
  for (const live of [true, false]) {
    const port = await devServer({ live, origin: 'http://127.0.0.1:1' })
    assert.equal((await get(port, '/api/v1/stats.json')).status, 299)
  }
})

test('sample mode answers a missing file with 404, never the SPA shell', async () => {
  const port = await devServer({ live: false })
  const r = await get(port, '/api/v1/sources/au.jsonld')
  assert.equal(r.status, 404)
  assert.match(r.headers['content-type'], /text\/plain/)
})

test('a path escaping api/v1 is 404 even in live mode', async () => {
  let hit = false
  const up = await listen((req, res) => { hit = true; res.end() })
  const port = await devServer({ live: true, origin: `http://127.0.0.1:${up}` })
  assert.equal((await get(port, '/api/v1/%2e%2e/%2e%2e/package.json')).status, 404)
  assert.equal(hit, false)
})

test('live mode relays the upstream body and filters its headers', async () => {
  const up = await listen((req, res) => {
    assert.equal(req.url, '/api/v1/sources/au.jsonld?x=1')
    res.writeHead(200, {
      'content-type': 'application/ld+json',
      connection: 'close, x-hop',
      'x-hop': 'named in Connection',
      'keep-alive': 'timeout=5',
      'proxy-authenticate': 'Basic',
      'set-cookie': 'session=live',
      'x-kept': 'yes',
    })
    res.end('{"live":true}')
  })
  const port = await devServer({ live: true, origin: `http://127.0.0.1:${up}` })
  const r = await get(port, '/api/v1/sources/au.jsonld?x=1')
  assert.equal(r.status, 200)
  assert.equal(r.body, '{"live":true}')
  assert.equal(r.headers['x-kept'], 'yes')
  assert.equal(r.headers['content-type'], 'application/ld+json')
  // Keep-Alive is not checked on the wire: the dev side's own Node server
  // adds one for its hop. forwardableHeaders is checked for it below.
  for (const h of ['x-hop', 'proxy-authenticate', 'set-cookie']) {
    assert.equal(r.headers[h], undefined, h)
  }
})

test('forwardableHeaders drops Connection-named tokens case-insensitively', () => {
  assert.deepEqual(
    forwardableHeaders({ connection: 'Keep-Alive, X-A', 'x-a': '1', 'x-b': '2', 'transfer-encoding': 'chunked', te: 'x', trailer: 'y', upgrade: 'z' }),
    { 'x-b': '2' },
  )
})

test('an upstream that stays silent is a 504', async () => {
  const up = await listen(() => {})
  const port = await devServer({ live: true, origin: `http://127.0.0.1:${up}`, idleMs: 200 })
  const r = await get(port, '/api/v1/sources/au.jsonld')
  assert.equal(r.status, 504)
  assert.match(r.body, /timed out/)
})

test('an upstream failure before any header is a 502', async () => {
  const up = await listen(() => {})
  const dead = servers.pop()
  await new Promise((resolve) => dead.close(resolve))
  const port = await devServer({ live: true, origin: `http://127.0.0.1:${up}` })
  assert.equal((await get(port, '/api/v1/sources/au.jsonld')).status, 502)
})

test('an upstream failure after the headers cuts the connection, not a 502', async () => {
  const up = await listen((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': '100' })
    res.write('{"partial":')
    setTimeout(() => res.socket.destroy(), 50)
  })
  const port = await devServer({ live: true, origin: `http://127.0.0.1:${up}` })
  const r = await get(port, '/api/v1/sources/au.jsonld')
  assert.equal(r.status, 200)
  assert.equal(r.complete, false)
})

test('a client that goes away takes the upstream request with it', async () => {
  let upstreamClosed
  const closed = new Promise((resolve) => { upstreamClosed = resolve })
  const up = await listen((req, res) => {
    res.writeHead(200)
    res.write('x')
    res.on('close', () => upstreamClosed(true))
  })
  const port = await devServer({ live: true, origin: `http://127.0.0.1:${up}` })
  await get(port, '/api/v1/sources/au.jsonld', { abortAfterMs: 100 })
  assert.equal(await Promise.race([closed, new Promise((r) => setTimeout(() => r(false), 2000))]), true)
})

test('the live origin must be a bare https origin', () => {
  assert.equal(resolveLiveOrigin(undefined), SITE_ORIGIN)
  assert.equal(resolveLiveOrigin(''), SITE_ORIGIN)
  assert.equal(resolveLiveOrigin('https://10.255.255.1'), 'https://10.255.255.1')
  for (const bad of ['http://www.ammitto.org', 'www.ammitto.org', 'https://x.org/api', 'https://x.org/?a=1']) {
    assert.throws(() => resolveLiveOrigin(bad), /AMMITTO_DEV_LIVE_ORIGIN/, bad)
  }
})
