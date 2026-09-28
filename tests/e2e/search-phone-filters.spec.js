import { test, expect } from '@playwright/test'

/**
 * The two "clear" controls on the search page, at phone width, in the built
 * page: "Clear all" empties the facet filters and leaves the typed query, and
 * the search box's own clear button empties the query and leaves the facets.
 * Screening a name, a reader widens the net around it without retyping it, and
 * edits the name without losing the filters they set.
 *
 * Nothing here needs the search index: the query and the filters are page
 * state read from the URL, and the chips take their labels from `@/config`.
 * So the index request is never waited on, and the assertions hold on the
 * committed snapshot and on the full dataset alike.
 */

const PHONE = { width: 390, height: 844 }
const PHONES = [{ width: 375, height: 667 }, PHONE]
// "Clear all" in the bar shows from 400px; narrower, the drawer carries it.
const WIDE_PHONE = { width: 412, height: 915 }

const FILTERED = '/search?q=smith&type=person&type=organization'

async function hydrated(page) {
  await page.waitForFunction(() => Boolean(document.querySelector('#app')?.__vue_app__))
}

const bar = (page) => page.getByTestId('applied-filters-bar')
const chip = (page, label) => bar(page).getByRole('button', { name: `Remove filter: ${label}` })
const searchBox = (page) => page.getByPlaceholder(/Name, alias/)
const clearSearch = (page) => page.getByRole('button', { name: 'Clear search' })
const filtersButton = (page, n) =>
  page.getByRole('button', { name: n ? `Filters (${n})` : 'Filters', exact: true })

async function openFiltered(page) {
  await page.goto(FILTERED, { waitUntil: 'domcontentloaded' })
  await hydrated(page)
  // The chips come from the URL on mount, so seeing them means the page is live.
  // The second may be folded into "+1" when the row is short of room, so the
  // count is read off the Filters button, which names every facet filter.
  await expect(chip(page, 'Person')).toBeVisible()
  await expect(filtersButton(page, 2)).toBeVisible()
  await expect(searchBox(page)).toHaveValue('smith')
}

async function expectFacetsClearedQueryKept(page) {
  await expect(bar(page).getByRole('button', { name: /^Remove filter:/ })).toHaveCount(0)
  await expect(page.getByTestId('applied-filters-more')).toHaveCount(0)
  await expect(filtersButton(page)).toBeVisible()
  await expect(searchBox(page)).toHaveValue('smith')
  await expect(page).toHaveURL(/[?&]q=smith(&|$)/)
  expect(new URL(page.url()).searchParams.getAll('type')).toEqual([])
}

test.describe('clearing on the phone search page', () => {
  test('"Clear all" in the applied-filters bar clears the facets and keeps the query', async ({ page }) => {
    await page.setViewportSize(WIDE_PHONE)
    await openFiltered(page)
    await bar(page).getByRole('button', { name: 'Clear all' }).click()
    await expectFacetsClearedQueryKept(page)
  })

  for (const viewport of PHONES) {
    test(`"Clear all" in the filter drawer clears the facets and keeps the query at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await openFiltered(page)
      await filtersButton(page, 2).click()
      const drawer = page.getByRole('dialog', { name: 'Filters' })
      await expect(drawer).toBeVisible()
      await drawer.getByRole('button', { name: 'Clear all' }).click()
      await expectFacetsClearedQueryKept(page)
    })

    test(`the search box clear button shows only for real text, clears the query, keeps focus and the facets at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto('/search?type=person&type=organization', { waitUntil: 'domcontentloaded' })
      await hydrated(page)
      await expect(chip(page, 'Person')).toBeVisible()
      await expect(filtersButton(page, 2)).toBeVisible()

      const input = searchBox(page)
      await expect(clearSearch(page)).toHaveCount(0)
      await input.fill('   ')
      await expect(clearSearch(page)).toHaveCount(0)
      // Blank is no query in the address either, as on a reload.
      await expect.poll(() => new URL(page.url()).searchParams.has('q')).toBe(false)

      await input.fill('smith')
      await expect(clearSearch(page)).toBeVisible()
      const box = await clearSearch(page).boundingBox()
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)

      await clearSearch(page).click()
      await expect(input).toHaveValue('')
      await expect(input).toBeFocused()
      await expect(clearSearch(page)).toHaveCount(0)
      await expect(page).not.toHaveURL(/[?&]q=/)

      // By keyboard: the button is the next Tab stop after the field.
      await input.fill('smith')
      await input.press('Tab')
      await expect(clearSearch(page)).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(input).toHaveValue('')
      await expect(input).toBeFocused()

      // The facets were never touched.
      await expect(chip(page, 'Person')).toBeVisible()
      await expect(filtersButton(page, 2)).toBeVisible()
      expect(new URL(page.url()).searchParams.getAll('type')).toEqual(['person', 'organization'])
    })
  }

  test('the filter drawer is modal while open and lets go of the page when it closes', async ({ page }) => {
    await page.setViewportSize(PHONE)
    await openFiltered(page)
    const opener = filtersButton(page, 2)
    await opener.click()
    const drawer = page.getByRole('dialog', { name: 'Filters' })
    await expect(drawer).toBeVisible()

    const pageState = () => page.evaluate(() => ({
      inert: document.getElementById('app').hasAttribute('inert'),
      overflow: document.documentElement.style.overflow,
    }))
    expect(await pageState()).toEqual({ inert: true, overflow: 'hidden' })

    // Focus starts on the close button and Tab cycles inside the panel, both ways.
    const close = drawer.getByRole('button', { name: 'Close filters' })
    await expect(close).toBeFocused()
    const inDrawer = () => page.evaluate(() =>
      Boolean(document.activeElement?.closest('[role="dialog"]')))
    const count = await drawer.locator('button:not([disabled])').count()
    for (let i = 0; i < count + 2; i++) {
      await page.keyboard.press('Tab')
      expect(await inDrawer(), `Tab ${i + 1} left the drawer`).toBe(true)
    }
    // The header's "Clear all" comes first in the panel, the footer button last.
    await drawer.getByRole('button', { name: 'Clear all' }).focus()
    await page.keyboard.press('Shift+Tab')
    expect(await inDrawer(), 'Shift+Tab from the first control left the drawer').toBe(true)
    await expect(drawer.getByTestId('drawer-show-results')).toBeFocused()

    // Escape closes it. The panel still on screen for its closing transition is
    // already inert, in the same tick the page behind stops being inert.
    await close.focus()
    const closing = await page.evaluate(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await new Promise((resolve) => requestAnimationFrame(() => resolve()))
      const panel = document.querySelector('[role="dialog"]')
      return {
        panelPresent: Boolean(panel),
        panelInert: panel ? panel.hasAttribute('inert') : null,
        pageInert: document.getElementById('app').hasAttribute('inert'),
      }
    })
    expect(closing).toEqual({ panelPresent: true, panelInert: true, pageInert: false })
    await expect(drawer).toHaveCount(0)
    await expect(opener).toBeFocused()
    expect(await pageState()).toEqual({ inert: false, overflow: '' })
  })

  test('leaving the page with the filter drawer open releases the page', async ({ page }) => {
    await page.setViewportSize(PHONE)
    await openFiltered(page)
    await filtersButton(page, 2).click()
    await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible()
    await page.evaluate(() =>
      document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/about'))
    await expect(page).toHaveURL(/\/about$/)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(await page.evaluate(() => ({
      inert: document.getElementById('app').hasAttribute('inert'),
      overflow: document.documentElement.style.overflow,
    }))).toEqual({ inert: false, overflow: '' })
  })

  test('the home page search box clears without submitting its form', async ({ page }) => {
    await page.setViewportSize(PHONE)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await hydrated(page)
    const input = page.getByPlaceholder(/Search by name, country/)
    await input.fill('smith')
    await clearSearch(page).click()
    await expect(input).toHaveValue('')
    await expect(input).toBeFocused()
    await expect(page).toHaveURL(/\/$/)
  })

  // The placeholder is not a name: it goes once text is typed. The icons
  // beside the field are decoration and stay out of the accessibility tree.
  for (const path of ['/search', '/']) {
    test(`the search box on ${path} has a name of its own and hides its icons`, async ({ page }) => {
      await page.setViewportSize(PHONE)
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      await hydrated(page)
      const input = page.getByRole('textbox', { name: 'Search sanctions data', exact: true })
      await expect(input).toBeVisible()
      await input.fill('smith')
      await expect(input).toHaveAccessibleName('Search sanctions data')
      const exposed = await input.evaluate((el) =>
        [...el.parentElement.querySelectorAll('svg')]
          .filter((svg) => !svg.closest('[aria-hidden="true"]')).length)
      expect(exposed).toBe(0)
    })
  }
})
