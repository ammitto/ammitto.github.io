import { test, expect } from '@playwright/test'
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareSearchRuntime } from '../../scripts/build-search-runtime.mjs'
import { collectPageErrors } from './helpers.js'

let directory, manifest, sourceManifest, sourceBody
const rows = ['Alpha', 'Beta', 'Gamma'].map((name, i) => ({
  id: `https://www.ammitto.org/entity/cn/lazy-${i}`, ref: `cn/lazy-${i}`,
  primaryName: name, names: [name], type: 'person', authority: 'cn', status: 'active',
}))

test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ammitto-query-runtime-'))
  const sourceDirectory = join(directory, 'api/v1/search-index')
  await mkdir(sourceDirectory, { recursive: true })
  await mkdir(join(directory, 'assets'))
  for (const name of await readdir('dist/assets')) {
    if (name.endsWith('.js')) await writeFile(join(directory, 'assets', name), '')
  }
  sourceManifest = JSON.stringify({
    metadata: { generated: '2026-10-21T00:00:00Z', totalEntities: rows.length, sources: 1 },
    shards: [{ code: 'cn', file: 'cn.json', count: rows.length }],
  })
  sourceBody = JSON.stringify({ entities: rows })
  await writeFile(join(sourceDirectory, 'manifest.json'), sourceManifest)
  await writeFile(join(sourceDirectory, 'cn.json'), sourceBody)
  manifest = await prepareSearchRuntime(directory)
})
test.afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }) })

// `partResponse` sees query partitions only; `options` intercepts the
// partition-first assets (ids, columns, row chunks) and the catalogue shard.
async function setup(page, partResponse, options = {}) {
  const partitions = new Set(manifest.partitions.filter(Boolean).map(part => part.file))
  await page.route('**/api/v1/search-index/manifest.json', route => route.fulfill({ contentType: 'application/json', body: sourceManifest }))
  await page.route('**/api/v1/search-index/cn.json', async route => {
    if (options.shard && await options.shard(route)) return
    await route.fulfill({ contentType: 'application/json', body: sourceBody })
  })
  await page.route('**/search-runtime/index.json', route => route.fulfill({ json: manifest }))
  await page.route('**/search-runtime/*.bin', async route => {
    const file = new URL(route.request().url()).pathname.split('/').pop()
    if (partitions.has(file) ? partResponse && await partResponse(route, file) : options.asset && await options.asset(route, file)) return
    await route.fulfill({ contentType: 'application/octet-stream', body: await readFile(join(directory, 'search-runtime', file)) })
  })
}
const routerPush = (page, path) => page.evaluate(path => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(path), path)

test('blank browsing downloads no index parts; pending and revisited queries withhold verdicts', async ({ page }) => {
  const errors = collectPageErrors(page)
  let requests = 0, release
  let gate = new Promise(resolve => { release = resolve })
  await setup(page, async () => { requests++; await gate; return false })
  await page.goto('/search')
  await expect(page.getByTestId('search-count')).toContainText('3 results')
  expect(requests).toBe(0)
  const input = page.getByRole('searchbox', { name: 'Search sanctions data' })
  await input.fill('Alpha')
  await expect(page.getByTestId('query-progress')).toContainText('Alpha')
  await expect(page.getByTestId('search-count')).toBeHidden()
  await expect(page.getByRole('heading', { name: 'No match found', exact: true })).toBeHidden()
  await expect(page.getByTestId('search-skeleton')).toBeVisible()
  release()
  await expect(page.getByTestId('search-count')).toContainText('1 result')
  await expect(page.getByTestId('search-results')).toContainText('Alpha')
  expect(requests).toBe(1)

  await routerPush(page, '/about')
  gate = new Promise(resolve => { release = resolve })
  await routerPush(page, '/search?q=Beta')
  await expect(page.getByTestId('query-progress')).toContainText('Beta')
  await expect(page.getByTestId('search-count')).toBeHidden()
  await expect(page.getByRole('heading', { name: 'No match found', exact: true })).toBeHidden()
  release()
  await expect(page.getByTestId('search-count')).toContainText('1 result')
  await expect(page.getByTestId('search-results')).toContainText('Beta')
  expect(requests).toBe(2)
  expect(errors).toEqual([])
})

test('a missing query part falls back to complete original results', async ({ page }) => {
  const errors = collectPageErrors(page)
  let requests = 0
  await setup(page, async route => { requests++; await route.fulfill({ status: 404, body: 'missing' }); return true })
  await page.goto('/search?q=Alpha')
  await expect(page.getByTestId('search-count')).toContainText('1 result')
  await expect(page.getByTestId('search-results')).toContainText('Alpha')
  await expect(page.getByRole('heading', { name: 'No match found', exact: true })).toBeHidden()
  expect(requests).toBe(1)
  expect(errors).toEqual([])
})

test('a URL query answers before the catalogue shard is downloaded (partition-first)', async ({ page }) => {
  const errors = collectPageErrors(page)
  let release
  const gate = new Promise(resolve => { release = resolve })
  let shardRequests = 0
  await setup(page, null, { shard: async () => { shardRequests++; await gate; return false } })
  await page.goto('/search?q=Alpha')
  await expect(page.getByTestId('search-count')).toContainText('1 result')
  await expect(page.getByTestId('search-results')).toContainText('Alpha')
  // Blank browsing and filters are exact from the columns alone as well.
  await page.getByRole('searchbox', { name: 'Search sanctions data' }).fill('')
  await expect(page.getByTestId('search-count')).toContainText('3 results')
  await expect(page.getByTestId('search-results')).toContainText('Gamma')
  release()
  await expect.poll(() => shardRequests).toBe(1)
  expect(errors).toEqual([])
})

test('a repeat visit is answered from the verified cache without downloading index assets', async ({ page }) => {
  const errors = collectPageErrors(page)
  let binRequests = 0
  await setup(page, async () => { binRequests++; return false }, { asset: async () => { binRequests++; return false } })
  await page.goto('/search?q=Alpha')
  await expect(page.getByTestId('search-results')).toContainText('Alpha')
  const first = binRequests
  expect(first).toBeGreaterThan(0)
  // Background cache writes are asynchronous; wait until every asset is stored.
  await expect.poll(() => page.evaluate(async () => (await (await caches.open('ammitto-search-assets-v1')).keys()).length)).toBeGreaterThanOrEqual(first)
  await page.reload()
  await expect(page.getByTestId('search-count')).toContainText('1 result')
  await expect(page.getByTestId('search-results')).toContainText('Alpha')
  expect(binRequests).toBe(first)
  expect(errors).toEqual([])
})

let shardFetches = 0
for (const [name, options] of [
  ['the published shard does not match the runtime binding', { shard: async route => {
    shardFetches++
    await route.fulfill({ contentType: 'application/json', body: `${sourceBody} ` }); return true } }],
  ['a row chunk is damaged', { asset: async (route, file) => {
    if (!manifest.fast.rows.some(asset => asset.file === file)) return false
    await route.fulfill({ contentType: 'application/octet-stream', body: Buffer.from('damaged') }); return true } }],
]) {
  test(`falls back to the complete original builder when ${name}`, async ({ page }) => {
    const errors = collectPageErrors(page)
    await setup(page, null, options)
    await page.goto('/search?q=Beta')
    await expect(page.getByTestId('search-count')).toContainText('1 result')
    await expect(page.getByTestId('search-results')).toContainText('Beta')
    // After the background check settles the page still answers exactly.
    await page.waitForTimeout(3000)
    await page.getByRole('searchbox', { name: 'Search sanctions data' }).fill('Gamma')
    await expect(page.getByTestId('search-count')).toContainText('1 result')
    await expect(page.getByTestId('search-results')).toContainText('Gamma')
    await expect(page.getByTestId('search-results')).not.toContainText('Beta')
    // The mismatch case: the background check and the fallback builder both read the shard.
    if (options.shard) expect(shardFetches).toBeGreaterThanOrEqual(2)
    expect(errors).toEqual([])
  })
}
