import { test, expect } from '@playwright/test'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

test('production registration caches only built static assets and never serves API or pages offline', async ({ page, context }) => {
  await page.goto('/about')
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)

  const asset = await page.locator('script[type="module"][src]').first().getAttribute('src')
  expect(asset).toMatch(/^\/assets\/.+-[\w-]+\.js$/)
  await page.evaluate((url) => fetch(url).then((response) => response.text()), asset)
  await expect.poll(() => page.evaluate(async (url) => {
    const names = (await caches.keys()).filter((name) => /^ammitto-static-v1-[a-f0-9]{64}$/.test(name))
    for (const name of names) if (await (await caches.open(name)).match(url)) return true
    return false
  }, asset)).toBe(true)
  const reused = page.waitForResponse((response) => new URL(response.url()).pathname === asset)
  await page.evaluate((url) => fetch(url).then((response) => response.text()), asset)
  expect((await reused).fromServiceWorker()).toBe(true)

  for (let request = 0; request < 2; request++) {
    const observed = page.waitForResponse((response) => response.url().endsWith('/api/v1/stats.json'))
    await page.evaluate(() => fetch('/api/v1/stats.json', { cache: 'no-store' }).then((response) => response.json()))
    expect((await observed).fromServiceWorker()).toBe(false)
  }

  const cachedPaths = await page.evaluate(async () => {
    const result = []
    for (const name of await caches.keys()) {
      if (!/^ammitto-static-v1-[a-f0-9]{64}$/.test(name)) continue
      for (const request of await (await caches.open(name)).keys()) result.push(new URL(request.url).pathname)
    }
    return result
  })
  expect(cachedPaths.length).toBeGreaterThan(0)
  expect(cachedPaths.every((path) => /^\/assets\/.+\.(js|css|woff2?|png|jpe?g|webp|avif|gif|svg)$/.test(path))).toBe(true)
  expect(cachedPaths.length).toBeLessThanOrEqual(96)

  // Remove HTTP-cache evidence: offline success below must come from the
  // worker's CacheStorage, while default data/document fetches must fail.
  const session = await context.newCDPSession(page)
  await session.send('Network.clearBrowserCache')
  await session.detach()
  await context.setOffline(true)
  try {
    const offline = await page.evaluate(async (url) => {
      const canFetch = async (path) => {
        try { return (await fetch(path)).ok } catch { return false }
      }
      // Default-cache hashed assets may use the worker; sensitive paths cannot.
      const cachedAsset = await fetch(url).then((response) => response.ok).catch(() => false)
      return {
        cachedAsset,
        api: await canFetch('/api/v1/stats.json'),
        page: await canFetch('/index.html'),
        openapi: await canFetch('/openapi.json'),
        query: await canFetch('/queries/active-cn-entries.rq'),
      }
    }, asset)
    expect(offline).toEqual({ cachedAsset: true, api: false, page: false, openapi: false, query: false })
  } finally { await context.setOffline(false) }
})

test('actual worker update waits for the open tab and cleans up only its own prior cache', async ({ browser }) => {
  const workerSource = readFileSync(resolve('dist/service-worker.js'), 'utf8')
  const manifest = /const ASSETS = new Map\((\[[^\n]+\])\)/.exec(workerSource)
  expect(manifest, 'the production worker must contain its generated manifest').toBeTruthy()
  const [assetPath, metadata] = JSON.parse(manifest[1]).find(([path]) => path.endsWith('.js'))
  const assetBody = readFileSync(resolve('dist', assetPath.slice(1)))
  const oldCache = `ammitto-static-v1-${'c'.repeat(64)}`
  const newCache = `ammitto-static-v1-${'d'.repeat(64)}`
  let version = 1
  let apiRequests = 0
  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    if (request.url === '/service-worker.js') {
      response.setHeader('Content-Type', 'text/javascript')
      response.end(workerSource.replace(/ammitto-static-v1-[a-f0-9]{64}/, version === 1 ? oldCache : newCache))
    } else if (request.url === assetPath) {
      response.setHeader('Content-Type', metadata.types[0])
      response.removeHeader('Cache-Control')
      response.setHeader('Content-Encoding', 'gzip')
      response.end(gzipSync(assetBody))
    } else if (request.url === '/api/v1/stats.json') {
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ request: ++apiRequests }))
    } else {
      response.setHeader('Content-Type', 'text/html')
      response.end('<!doctype html><title>Worker lifecycle test</title><input id="work" value="original">')
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.goto(origin)
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/service-worker.js', { updateViaCache: 'none' })
      await navigator.serviceWorker.ready
    })
    await page.reload()
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
    await page.evaluate(async (url) => {
      await caches.open('other-application')
      await fetch(url).then((response) => response.text())
    }, assetPath)
    await expect.poll(() => page.evaluate(async (name) => (await (await caches.open(name)).keys()).length, oldCache)).toBe(1)
    expect(await page.evaluate(async () => {
      const first = await (await fetch('/api/v1/stats.json')).json()
      const second = await (await fetch('/api/v1/stats.json')).json()
      return [first.request, second.request]
    })).toEqual([1, 2])

    await page.locator('#work').fill('unsaved work survives')
    version = 2
    const updatedWorker = context.waitForEvent('serviceworker')
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update())
    const waitingWorker = await updatedWorker
    await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting)).toBe(true)
    await expect(page.locator('#work')).toHaveValue('unsaved work survives')
    expect(await page.evaluate(() => caches.keys())).toContain(oldCache)

    // Closing the controlled client lets the browser activate the waiting
    // version naturally, rather than a test forcing skipWaiting or reloading it.
    await page.close()
    await expect.poll(() => waitingWorker.evaluate(() =>
      self.registration.waiting === null && self.registration.active?.state === 'activated',
    )).toBe(true)
    const nextPage = await context.newPage()
    await nextPage.goto(origin)
    await expect.poll(() => nextPage.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration()
      return registration?.waiting?.state || registration?.active?.state
    })).toBe('activated')
    await nextPage.evaluate((url) => fetch(url).then((response) => response.text()), assetPath)
    await expect.poll(() => nextPage.evaluate(() => caches.keys())).toContain(newCache)
    const names = await nextPage.evaluate(() => caches.keys())
    expect(names).not.toContain(oldCache)
    expect(names).toContain('other-application')
  } finally {
    await context.close()
    await new Promise((resolve) => server.close(resolve))
  }
})
