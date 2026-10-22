import { test, expect } from '@playwright/test'
import { collectPageErrors, gotoRendered } from './helpers.js'

// Entity deep links are served from the 404.html shell, whose static head
// describes the home page. Once the record loads, the head must describe the
// record: its own canonical/og:url, title and a schema.org JSON-LD block.
test('an entity page sets a record-specific canonical, og tags and JSON-LD', async ({ page }) => {
  const errors = collectPageErrors(page)
  await gotoRendered(page, '/entity/cn/1-general-dynamics')
  const url = 'https://www.ammitto.org/entity/cn/1-general-dynamics'

  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', url)
  await expect(page.locator('meta[property="og:url"]')).toHaveCount(1)
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', url)
  await expect(page.locator('meta[name="description"]')).toHaveCount(1)
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /^Sanctions record for /)
  await expect(page).not.toHaveTitle(/^Entity record/)

  const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent())
  expect(ld['@context']).toBe('https://schema.org')
  expect(ld.url).toBe(url)
  expect(ld.identifier).toBe('cn/1-general-dynamics')
  expect(typeof ld.name).toBe('string')
  expect(errors).toEqual([])
})
