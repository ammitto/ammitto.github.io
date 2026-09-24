import { test, expect } from '@playwright/test'
import { collectPageErrors, gotoRendered, useTheme } from './helpers.js'

/**
 * What the home page says about its sources, checked where a reader sees it.
 * The badges sit directly under a sentence naming the EU, the UN and the US,
 * so they have to name those three and must not spend a slot on a second list
 * from one authority; the grid and footer have to carry the largest lists.
 */
test('home page features the major sources and reads cleanly', async ({ page }) => {
  const errors = collectPageErrors(page)
  await useTheme(page, 'dark')
  await gotoRendered(page, '/')

  // Soft assertions: each check is independent, so one failing must not
  // hide whether the others hold.
  const badges = await page.locator('.hero-section .tone-pill').allTextContents()
  expect.soft(badges.map((text) => text.trim())).toEqual([
    'European Union',
    'United Nations',
    'United States',
    'United Kingdom',
  ])

  const grid = page.locator('section', { has: page.getByRole('heading', { name: 'Data Sources' }) })
  const gridNames = (await grid.locator('h3').allTextContents()).map((text) => text.trim())
  expect.soft(gridNames).toEqual([
    'European Union',
    'United Nations',
    'United States',
    'United Kingdom',
    'Switzerland',
    'Canada',
    'Japan',
    'Australia',
  ])

  const footerColumn = page.locator('footer div', { has: page.locator('h4', { hasText: 'Data Sources' }) }).last()
  const footerNames = (await footerColumn.locator('li a').allTextContents()).map((text) => text.trim())
  expect.soft(footerNames).toEqual([
    'European Union',
    'United Nations',
    'United States',
    'United Kingdom',
    'Switzerland',
  ])

  // Normalised the way a reader sees it: a line break in the template is a
  // space on screen, which is how the full stop came adrift from its link.
  const readable = async (locator) => (await locator.textContent()).replace(/\s+/g, ' ').trim()

  const getStarted = await readable(page.locator('p', { hasText: 'download the data directly' }))
  expect.soft(getStarted).toContain('download the data directly.')

  // The count comes from stats.json, so it differs between the committed
  // snapshot and a full build; the noun has to agree with whichever it is.
  const summary = page.locator('p', { hasText: 'official source' })
  await expect(summary).toContainText(/from\s+\d+\s+official/)
  const text = await readable(summary)
  const count = Number(text.match(/from (\d+) official/)[1])
  expect.soft(text).toContain(count === 1 ? 'official source worldwide' : 'official sources worldwide')

  expect(errors).toEqual([])
})

/**
 * The sentence above the grid, for each shape stats.json can take: one
 * published source, several, and no usable response at all, when the count is
 * withheld rather than printed as zero. The response is fixed per case so the
 * noun is checked against a known count, whatever snapshot the build carries.
 */
const summaryCases = [
  {
    name: 'one source',
    stats: { total_entities: 323, sources: { cn: {} } },
    expected: 'We aggregate sanctions data from 1 official source worldwide, currently covering 323 entities.',
  },
  {
    name: 'several sources',
    stats: { total_entities: 1234, sources: { eu: {}, un: {} } },
    expected: 'We aggregate sanctions data from 2 official sources worldwide, currently covering 1,234 entities.',
  },
  {
    name: 'no stats',
    stats: null,
    expected: 'We aggregate sanctions data from official sources worldwide.',
  },
]

for (const { name, stats, expected } of summaryCases) {
  test(`home page source summary reads correctly with ${name}`, async ({ page }) => {
    await page.route('**/api/v1/stats.json', (route) =>
      stats
        ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(stats) })
        : route.fulfill({ status: 404, body: '' }),
    )
    await gotoRendered(page, '/')

    const summary = page.locator('p', { hasText: 'official source' })
    await expect(summary).toHaveText(expected, { useInnerText: true })
  })
}
