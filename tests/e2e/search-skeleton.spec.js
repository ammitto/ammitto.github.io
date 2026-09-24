import { test, expect } from '@playwright/test'
import { collectPageErrors } from './helpers.js'

/**
 * The loading placeholders in the rendered page, not just in the template.
 *
 * The index request is held until the test releases it, so the placeholders
 * are observed while it is certainly still loading. Every DOM mutation is
 * checked from before the app starts, so a single frame showing placeholders
 * next to the "No match found" card, or next to a result card that is not
 * under the "still checking" banner, is still caught. Partial matches shown
 * above the placeholders while the index builds are the intended exception:
 * tests/e2e/search-progressive.spec.js covers them.
 */

/**
 * How long the answer may take to appear once the index is released. On the
 * committed snapshot the build is instant, but the deploy workflow runs this
 * suite against the full harmonized dataset, whose index build takes seconds
 * even unthrottled and much longer on a slow or busy runner. The wait ends
 * as soon as the answer is on screen, so a generous bound costs nothing when
 * the build is fast.
 */
const BUILD_TIMEOUT = 120_000

async function holdSearchIndex(page) {
  let release = () => {}
  const gate = new Promise((resolve) => { release = resolve })
  let markSeen = () => {}
  const seen = new Promise((resolve) => { markSeen = resolve })
  await page.route('**/api/v1/search-index.json', async (route) => {
    markSeen()
    await gate
    await route.fallback()
  })
  return { release, seen }
}

async function watchForOverlap(page) {
  await page.addInitScript(() => {
    window.__overlap = []
    const check = () => {
      const skeleton = document.querySelector('[data-testid="search-skeleton"]')
      if (!skeleton) return
      const partial = !!document.querySelector('[data-testid="search-progress"]')
      const cards = partial ? 0 : document.querySelectorAll('main a[href^="/entity/"]').length
      const noMatch = document.body.innerText.includes('No match found')
      if (cards || noMatch) window.__overlap.push({ cards, noMatch })
    }
    new MutationObserver(check).observe(document, {
      childList: true, subtree: true, characterData: true,
    })
  })
}

async function expectPlaceholdersWhileHeld(page) {
  const skeleton = page.getByTestId('search-skeleton')
  await expect(skeleton).toBeVisible()
  await expect(skeleton).toHaveAttribute('aria-hidden', 'true')
  await expect(skeleton.locator('> div')).toHaveCount(6)
  expect((await skeleton.textContent()).trim()).toBe('')
  await expect(page.locator('main a[href^="/entity/"]')).toHaveCount(0)
  await expect(page.getByText('No match found')).toHaveCount(0)
}

for (const { name, query, settled } of [
  {
    name: 'a matching query',
    query: 'Dedrone',
    // Settled means the result count, not the first card: partial matches
    // appear while the index is still building (search-progressive.spec.js),
    // so a card on screen no longer means the load has finished.
    settled: async (page) => {
      await expect(page.getByTestId('search-count')).toBeVisible({ timeout: BUILD_TIMEOUT })
      await expect(page.locator('main a[href^="/entity/"]').first()).toBeVisible()
    },
  },
  {
    name: 'a query with no match',
    query: 'zzqxqzzqxq',
    settled: (page) => expect(page.getByText('No match found'))
      .toBeVisible({ timeout: BUILD_TIMEOUT }),
  },
]) {
  test(`placeholders show while the index loads and give way to the answer: ${name}`, async ({ page }) => {
    test.setTimeout(BUILD_TIMEOUT + 60_000)
    const errors = collectPageErrors(page)
    await watchForOverlap(page)
    const index = await holdSearchIndex(page)

    await page.goto(`/search?q=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded' })
    await index.seen
    await expectPlaceholdersWhileHeld(page)

    index.release()
    await settled(page)
    await expect(page.getByTestId('search-skeleton')).toHaveCount(0)
    expect(await page.evaluate(() => window.__overlap)).toEqual([])
    expect(errors).toEqual([])
  })
}
