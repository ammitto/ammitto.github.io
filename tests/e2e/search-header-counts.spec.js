import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { collectPageErrors } from './helpers.js'

/**
 * The /search header must not state a count it does not have.
 *
 * Both figures in "Search across N data sources covering M sanctioned
 * entities" come from `metadata` inside search-index.json, which arrives only
 * after the whole index has downloaded and parsed. Rendered unconditionally,
 * the sentence read "0 data sources covering 0 sanctioned entities" for the
 * length of that download, and permanently in the vite-ssg prerendered HTML
 * that crawlers and no-JS readers get. On a screening tool a zero is an
 * answer, so it has to be withheld until it is known.
 */

const PREMATURE_ZERO = /\b0\s+(data sources|sanctioned entities|lists)\b/
const NOT_A_COUNT = /\b0\s+(data sources|sanctioned entities|lists)\b|NaN|undefined|null/
const NEUTRAL_HEADER = 'Search the sanctions lists Ammitto collects.'
const NO_MATCH_QUERY = 'qqzzxxjjvvkkww'

/**
 * A small index, served in place of the real one.
 *
 * These tests are about what the page SAYS given some metadata, not about the
 * corpus, so they must not pay for it: against the deployed 61k-row dataset,
 * indexing the real file in several parallel workers took longer than the
 * test budget. Three rows of the shape the producer emits are enough.
 */
function syntheticIndex(metadata) {
  const row = (ref, type, name, authority) => ({
    id: `https://www.ammitto.org/entity/${ref}`,
    ref,
    type,
    names: [name],
    primaryName: name,
    country: 'EXAMPLE',
    authority,
    listType: 'consolidated-list',
    status: 'active',
  })
  return {
    metadata: {
      generated: '2026-09-01T06:00:00Z',
      totalEntities: 3,
      sources: 2,
      ...metadata,
    },
    entities: [
      row('un/test-1', 'person', 'Alpha Example Person', 'un'),
      row('eu/test-2', 'organization', 'Beta Example Trading', 'eu'),
      row('eu/test-3', 'vessel', 'Gamma Example Vessel', 'eu'),
    ],
  }
}

/** Serve `index` for search-index.json, after `gate` resolves if one is given. */
async function serveIndex(page, index, gate) {
  const body = JSON.stringify(index)
  await page.route('**/api/v1/search-index.json', async (route) => {
    if (gate) await gate
    await route.fulfill({ status: 200, contentType: 'application/json', body })
  })
}

/** The sentence under the page title. */
function headerOf(page) {
  return page
    .locator('h1', { hasText: 'Search Sanctions Database' })
    .locator('xpath=following-sibling::p[1]')
}

test('the prerendered /search HTML states no zero count', async ({ browser, request }) => {
  // Served bytes must be the prerendered page itself, not the SPA fallback
  // (404.html, a copy of the home page) that a missing route would get.
  const response = await request.get('/search')
  expect(response.ok()).toBeTruthy()
  const served = await response.text()
  const built = readFileSync(new URL('../../dist/search.html', import.meta.url), 'utf8')
  expect(served).toBe(built)

  // What a crawler or a no-JS reader gets: the page with no script run.
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto('/search')
  const header = headerOf(page)
  await expect(header).toHaveText(NEUTRAL_HEADER)
  await expect(header).not.toHaveText(PREMATURE_ZERO)
  await context.close()
})

test('the /search header withholds its counts until the index arrives', async ({ page }) => {
  const errors = collectPageErrors(page)

  // Hold the index back until the loading state has been inspected.
  let release
  const held = new Promise((resolve) => {
    release = resolve
  })
  await serveIndex(page, syntheticIndex({ totalEntities: 1234, sources: 14 }), held)

  const indexRequested = page.waitForRequest('**/api/v1/search-index.json')
  await page.goto('/search', { waitUntil: 'domcontentloaded' })
  const header = headerOf(page)
  await expect(header).toBeVisible()
  // Wait for the app to hydrate and start the (held) index request, so the
  // client-rendered loading state is what is read, not only the prerender.
  await indexRequested
  await expect(header).toHaveText(NEUTRAL_HEADER)

  release()
  await expect(header).toHaveText(
    'Search across 14 data sources covering 1,234 sanctioned entities.',
  )
  expect(errors).toEqual([])
})

/** Load /search on a query nothing matches, and return what the page says. */
async function noMatchState(page) {
  await page.goto(`/search?q=${NO_MATCH_QUERY}`, { waitUntil: 'domcontentloaded' })
  const card = page.locator('.glass-card', { hasText: 'No match found' })
  await expect(card).toBeVisible()
  const live = page.locator('[role="status"][aria-live="polite"]')
  await expect(live).toContainText('No match.')
  return {
    header: headerOf(page),
    card: await card.innerText(),
    announced: await live.textContent(),
  }
}

test('a count of one is stated in the singular', async ({ page }) => {
  await serveIndex(page, syntheticIndex({ totalEntities: 1, sources: 1 }))
  const { header, card, announced } = await noMatchState(page)
  await expect(header).toHaveText('Search across 1 data source covering 1 sanctioned entity.')
  expect(card).toContain('No entity on the 1 list Ammitto covers matches')
  expect(announced).toContain('No entity on the 1 list Ammitto covers matches')
})

/**
 * The metadata is typed, not validated. Whatever arrives in it, the page must
 * never print a zero, NaN or undefined as a count: not in the header, not in
 * the no-match card's scope, not in the screen-reader announcement. It says
 * so once in the console, so a producer regression is visible.
 */
const MALFORMED = [
  ['sources missing', { sources: undefined }, 'sources'],
  ['sources 0', { sources: 0 }, 'sources'],
  ['sources "0"', { sources: '0' }, 'sources'],
  ['sources "NaN"', { sources: 'NaN' }, 'sources'],
  ['totalEntities "0"', { totalEntities: '0' }, 'totalEntities'],
]

for (const [label, override, field] of MALFORMED) {
  test(`/search states no bogus count when the index metadata has ${label}`, async ({ page }) => {
    const errors = collectPageErrors(page)
    const warnings = []
    page.on('console', (msg) => {
      if (msg.type() === 'warning' && msg.text().includes('search-index.json metadata')) {
        warnings.push(msg.text())
      }
    })
    await serveIndex(page, syntheticIndex(override))
    const { header, card, announced } = await noMatchState(page)

    await expect(header).toHaveText(NEUTRAL_HEADER)
    expect(card).not.toMatch(NOT_A_COUNT)
    expect(announced).not.toMatch(NOT_A_COUNT)
    if (field === 'sources') {
      expect(card).toContain('No entity on the lists Ammitto covers matches')
      expect(announced).toContain('No entity on the lists Ammitto covers matches')
    }
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain(field)
    expect(errors).toEqual([])
  })
}

/**
 * An implausible `generated` must not become a date. `new Date(0)`, `'0'` and
 * `1` all parse, to 1970 or 2000, and "Data as of 1 January 1970" on a
 * negative screening result is a false statement.
 */
for (const generated of [
  0,
  1,
  '0',
  '1970-01-01T00:00:00Z',
  '2099-01-01T00:00:00Z',
  // Impossible calendar dates: Date would roll each into a real, later day.
  '2026-02-31T00:00:00Z',
  '2026-02-29T00:00:00Z',
  '2026-13-01T00:00:00Z',
  '2026-04-31T00:00:00Z',
]) {
  test(`/search states no date when the index metadata has generated ${JSON.stringify(generated)}`, async ({
    page,
  }) => {
    await serveIndex(page, syntheticIndex({ generated }))
    const { card, announced } = await noMatchState(page)
    expect(card).not.toContain('Data as of')
    expect(announced).not.toContain('Data as of')
  })
}

test('a plausible generated date is stated', async ({ page }) => {
  await serveIndex(page, syntheticIndex({}))
  const { card, announced } = await noMatchState(page)
  expect(card).toContain('Data as of 1 September 2026.')
  expect(announced).toContain('Data as of 1 September 2026.')
})
