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

async function setup(page, partResponse) {
  await page.route('**/api/v1/search-index/manifest.json', route => route.fulfill({ contentType: 'application/json', body: sourceManifest }))
  await page.route('**/api/v1/search-index/cn.json', route => route.fulfill({ contentType: 'application/json', body: sourceBody }))
  await page.route('**/search-runtime/index.json', route => route.fulfill({ json: manifest }))
  await page.route('**/search-runtime/*.bin', async route => {
    const file = new URL(route.request().url()).pathname.split('/').pop()
    if (partResponse && await partResponse(route, file)) return
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
