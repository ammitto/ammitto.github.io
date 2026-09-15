import { test, expect } from '@playwright/test'
import { collectPageErrors, gotoRendered, useTheme } from './helpers.js'

const publishedSources = [
  'au',
  'ca',
  'ch',
  'cn',
  'eu',
  'eu_vessels',
  'jp',
  'nz',
  'tr',
  'uk',
  'un',
  'un_vessels',
  'us',
  'wb',
]

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

  await expect(page.locator('a[download]')).toHaveCount(16)
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
  await expect(page.locator('a[download="ru.jsonld"]')).toHaveCount(0)

  await gotoRendered(page, '/')
  await expect(
    page.getByRole('link', { name: /download the data directly/i }),
  ).toHaveAttribute('href', '/download')

  expect(errors).toEqual([])
})
