import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { collectPageErrors, gotoRendered, useTheme } from './helpers.js'

const { publishing_sources: publishedSources } = JSON.parse(
  readFileSync(new URL('../../.github/harmonize-thresholds.json', import.meta.url), 'utf8'),
)

test('download page shows verified sizes and real download links', async ({ page }) => {
  const errors = collectPageErrors(page)

  await useTheme(page, 'light')

  await page.route('**/api/v1/index.jsonld', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/ld+json',
      body: JSON.stringify({
        generated: '2026-09-14T11:54:44Z',
        entries: [
          { name: 'all.jsonld', url: 'all.jsonld', bytes: 156423069 },
          { name: 'all.ttl', url: 'all.ttl', bytes: 116000000 },
          ...publishedSources.map((code, index) => ({
            name: `${code}.jsonld`,
            url: `sources/${code}.jsonld`,
            bytes: 1000000 + index,
          })),
        ],
      }),
    }),
  )

  await gotoRendered(page, '/download')

  await expect(page.getByRole('heading', { name: 'Download the data' })).toBeVisible()
  // Both figures legitimately render twice by design: once in the size-warning
  // summary, once again beside the download link itself (the whole point of
  // the size-before-click constraint). .first() disambiguates the locator
  // without asserting away the intentional duplication.
  await expect(page.getByText(/156\.4 MB.*156,423,069 bytes/).first()).toBeVisible()
  await expect(page.getByText(/116\.0 MB.*116,000,000 bytes/).first()).toBeVisible()

  await expect(page.locator('a[download]')).toHaveCount(publishedSources.length + 2)
  await expect(page.locator('a[download="all.jsonld"]')).toHaveAttribute(
    'href',
    '/api/v1/all.jsonld',
  )
  await expect(page.locator('a[download="all.ttl"]')).toHaveAttribute(
    'href',
    '/api/v1/all.ttl',
  )
  await expect(page.locator('a[download="au.jsonld"]')).toHaveAttribute(
    'href',
    '/api/v1/sources/au.jsonld',
  )
  await expect(page.locator('a[download="ru.jsonld"]')).toHaveAttribute(
    'href',
    '/api/v1/sources/ru.jsonld',
  )

  await gotoRendered(page, '/')
  await expect(
    page.getByRole('link', { name: /download the data directly/i }),
  ).toHaveAttribute('href', '/download')

  expect(errors).toEqual([])
})

test('source download sizes fall back to verified response headers when the catalogue omits aggregates', async ({ page }) => {
  await page.route('**/api/v1/index.jsonld', route => route.fulfill({ json: { entries: [] } }))
  const methods = []
  await page.route('**/api/v1/sources/*.jsonld', route => {
    methods.push(route.request().method())
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'application/ld+json', 'Content-Length': '123456' }, body: '' })
  })
  await gotoRendered(page, '/download')
  await expect(page.locator('a[download]')).toHaveCount(publishedSources.length + 2)
  await expect(page.locator('a[download="cn.jsonld"]')).toContainText('123,456 bytes')
  await expect(page.locator('a[download="cn.jsonld"]')).toContainText('verified from current file headers')
  expect(methods).toHaveLength(publishedSources.length)
  expect(methods.every(method => method === 'HEAD')).toBe(true)
})

test('unverifiable source response headers keep download links unavailable', async ({ page }) => {
  await page.route('**/api/v1/index.jsonld', route => route.fulfill({ status: 503, body: '' }))
  await page.route('**/api/v1/sources/*.jsonld', route => {
    const code = route.request().url().split('/').pop().replace('.jsonld', '')
    const headers = { 'Content-Type': 'application/ld+json', 'Content-Length': '123456' }
    if (code === 'cn') headers['Content-Type'] = 'text/html'
    if (code === 'au') headers['Content-Encoding'] = 'gzip'
    if (code === 'ca') delete headers['Content-Length']
    return route.fulfill({ status: 200, headers, body: '' })
  })
  await gotoRendered(page, '/download')
  await expect(page.locator('a[download="ch.jsonld"]')).toBeVisible()
  for (const code of ['cn', 'au', 'ca']) await expect(page.locator(`a[download="${code}.jsonld"]`)).toHaveCount(0)
  await expect(page.locator('a[download]')).toHaveCount(publishedSources.length - 3 + 2)
})

test('compressed HEAD responses use a one-byte range to verify the complete source size', async ({ page }) => {
  await page.route('**/api/v1/index.jsonld', route => route.fulfill({ json: { entries: [] } }))
  const ranges = []
  await page.route('**/api/v1/sources/*.jsonld', route => {
    if (route.request().method() === 'HEAD') return route.fulfill({ status: 200,
      headers: { 'Content-Type': 'application/ld+json', 'Content-Length': '123', 'Content-Encoding': 'gzip' }, body: '' })
    ranges.push(route.request().headers().range)
    return route.fulfill({ status: 206, headers: { 'Content-Type': 'application/ld+json',
      'Content-Length': '1', 'Content-Range': 'bytes 0-0/987654' }, body: '{' })
  })
  await gotoRendered(page, '/download')
  await expect(page.locator('a[download]')).toHaveCount(publishedSources.length + 2)
  await expect(page.locator('a[download="cn.jsonld"]')).toContainText('987,654 bytes')
  expect(ranges).toHaveLength(publishedSources.length)
  expect(ranges.every(range => range === 'bytes=0-0')).toBe(true)
})
