import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { collectPageErrors, gotoRendered, useTheme } from './helpers.js'

for (const theme of ['light', 'dark']) {
  test(`API documentation downloads and code scrolling work on a phone (${theme})`, async ({ page }) => {
    // Cold navigation, three downloads, keyboard checks and a full axe scan
    // reached the old 30s budget under load after scrolling had passed.
    test.setTimeout(60000)
    const errors = collectPageErrors(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await useTheme(page, theme)
    await gotoRendered(page, '/api')
    await expect(page.getByRole('heading', { name: 'SPARQL: query a local dataset' })).toBeVisible()
    await expect(page.locator('main')).toHaveCount(1)

    const links = await page.locator('a[download]').evaluateAll((items) => items.map((item) => item.href))
    expect(links).toHaveLength(3)
    for (const url of links) {
      const response = await page.request.get(url)
      expect(response.status()).toBe(200)
      const body = await response.text()
      if (url.endsWith('.json')) expect(JSON.parse(body).openapi).toBe('3.1.0')
      else expect(body).toContain('PREFIX ammitto: <https://www.ammitto.org/ontology/>')
    }

    const index = await page.locator('pre').evaluateAll((items) =>
      items.findIndex((item) => item.scrollWidth > item.clientWidth),
    )
    expect(index).toBeGreaterThanOrEqual(0)
    const code = page.locator('pre').nth(index)
    // Tab must reach the scroll area from the Copy button before it.
    await code.locator('..').getByRole('button', { name: 'Copy', exact: true }).focus()
    await page.keyboard.press('Tab')
    await expect(code).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => code.evaluate((item) => item.scrollLeft)).toBeGreaterThan(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(result.violations).toEqual([])
    expect(errors).toEqual([])
  })

  test(`search results have one main landmark (${theme})`, async ({ page }) => {
    await useTheme(page, theme)
    await gotoRendered(page, '/search')
    await expect(page.getByRole('region', { name: 'Search results' })).toBeVisible()
    await expect(page.locator('main')).toHaveCount(1)
    await expect(page.locator('main main')).toHaveCount(0)
    const result = await new AxeBuilder({ page })
      .withRules(['landmark-main-is-top-level', 'landmark-one-main', 'landmark-no-duplicate-main'])
      .analyze()
    expect(result.violations).toEqual([])
  })
}
