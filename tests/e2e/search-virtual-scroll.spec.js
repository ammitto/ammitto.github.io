import { test, expect } from '@playwright/test'
import { collectPageErrors, expectNoHorizontalOverflow } from './helpers.js'

const COUNT = 300
const entities = Array.from({ length: COUNT }, (_, i) => {
  const name = `Needle${String(i).padStart(3, '0')} Holdings`
  return {
    id: `https://www.ammitto.org/entity/cn/virtual-${i}`,
    ref: `cn/virtual-${i}`,
    names: i % 3 ? [name] : [name, 'A very long alias for a variable height result card'],
    primaryName: name,
    type: i % 2 ? 'person' : 'organization',
    authority: 'cn',
    status: 'active',
    country: i % 4 ? 'IRAN' : 'The Democratic Socialist Republic of Somewhere Very Long Indeed',
  }
})

async function openResults(page) {
  await page.route('**/api/v1/search-index/manifest.json', (route) => route.fulfill({
    json: {
      metadata: { totalEntities: COUNT, sources: 1, generated: '2026-10-15T00:00:00Z' },
      shards: [{ code: 'cn', file: 'virtual.json', count: COUNT }],
    },
  }))
  await page.route('**/api/v1/search-index/virtual.json', (route) => route.fulfill({ json: { entities } }))
  await page.goto('/search')
  await expect(page.getByTestId('search-count')).toContainText('300')
  await expect(page.getByTestId('search-results').locator('> a')).toHaveCount(50)
}

async function loadAll(page) {
  for (let i = 50; i < COUNT; i += 50) {
    await page.getByRole('button', { name: /^Load More/ }).click()
  }
  await expect(page.getByRole('button', { name: /^Load More/ })).toHaveCount(0)
}

async function scrollToGridEnd(page) {
  await page.getByTestId('search-results').evaluate((grid) => grid.scrollIntoView({ block: 'end', behavior: 'instant' }))
  await expect(page.locator(`[data-result-index="${COUNT - 1}"]`)).toBeInViewport()
}

test('repeated Load More keeps mounted cards bounded and reaches the final result', async ({ page }) => {
  const errors = collectPageErrors(page)
  await openResults(page)
  await loadAll(page)
  await scrollToGridEnd(page)
  const grid = page.getByTestId('search-results')
  await expect(grid).toHaveAttribute('data-virtual', 'true')
  expect(await grid.locator('> a').count()).toBeLessThan(40)
  await expect(grid.locator(`[data-result-index="${COUNT - 1}"]`)).toContainText('Needle299')
  await expect(page.getByTestId('search-count')).toContainText('300')

  // Browse-mode readers and browser Find can explicitly request every loaded
  // native link, instead of depending on their reader's virtual-list support.
  await page.getByRole('button', { name: 'Show all loaded results', exact: true }).click()
  await expect(grid.locator('> a')).toHaveCount(COUNT)
  await page.getByRole('button', { name: 'Use scrolling result view', exact: true }).click()
  await expect(grid).toHaveAttribute('data-virtual', 'true')
  expect(await grid.locator('> a').count()).toBeLessThan(40)
  expect(errors).toEqual([])
})

test('focus survives scrolling and Tab reaches an adjacent unmounted result', async ({ page }) => {
  const errors = collectPageErrors(page)
  await openResults(page)
  await loadAll(page)
  const grid = page.getByTestId('search-results')
  await grid.evaluate((element) => element.scrollIntoView({ block: 'start', behavior: 'instant' }))
  const first = grid.locator('[data-result-index="0"]')
  await first.focus()
  await scrollToGridEnd(page)
  await expect(first).toBeFocused()
  expect(await grid.locator('> a').count()).toBeLessThan(42)
  await page.keyboard.press('Tab')
  await expect(grid.locator('[data-result-index="1"]')).toBeFocused()
  await expect(grid.locator('[data-result-index="1"]')).toBeInViewport()
  // Repeated keyboard movement crosses several viewport windows.
  for (let i = 2; i <= 35; i++) await page.keyboard.press('Tab')
  await expect(grid.locator('[data-result-index="35"]')).toBeFocused()
  await expect(grid.locator('[data-result-index="35"]')).toBeInViewport()
  await page.keyboard.press('Shift+Tab')
  await expect(grid.locator('[data-result-index="34"]')).toBeFocused()
  for (let i = 33; i >= 0; i--) await page.keyboard.press('Shift+Tab')
  await expect(first).toBeFocused()
  const firstTop = await first.evaluate((card) => card.getBoundingClientRect().top)
  const headerBottom = await page.locator('header').evaluate((header) => header.getBoundingClientRect().bottom)
  expect(firstTop).toBeGreaterThanOrEqual(headerBottom)
  expect(errors).toEqual([])
})

test('mobile resize measures one-column cards, avoids overlap, and query changes reset the list', async ({ page }) => {
  const errors = collectPageErrors(page)
  await openResults(page)
  await loadAll(page)
  await page.setViewportSize({ width: 320, height: 700 })
  await scrollToGridEnd(page)
  await expectNoHorizontalOverflow(page, 'virtual search at 320px')
  await expect.poll(() => page.getByTestId('search-results').locator('> a').evaluateAll((cards) => {
    const boxes = cards.map((card) => card.getBoundingClientRect()).sort((a, b) => a.top - b.top)
    return boxes.every((box, i) => i === 0 || box.top >= boxes[i - 1].bottom + 15)
  })).toBe(true)

  const input = page.getByRole('textbox', { name: 'Search sanctions data' })
  await input.fill('Needle003')
  await expect(page.getByTestId('search-count')).toContainText('1 result')
  await expect(page.getByTestId('search-results').locator('> a')).toHaveCount(1)
  await expect(page.getByTestId('search-results')).toHaveAttribute('data-virtual', 'false')
  await input.fill('')
  await expect(page.getByTestId('search-count')).toContainText('300')
  await expect(page.getByTestId('search-results').locator('> a')).toHaveCount(50)
  expect(errors).toEqual([])
})
