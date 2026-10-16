import { test, expect } from '@playwright/test'
import { collectPageErrors, expectNoHorizontalOverflow } from './helpers.js'

const entities = Array.from({ length: 175 }, (_, i) => ({
  id: `https://www.ammitto.org/entity/cn/workflow-${i}`, ref: `cn/workflow-${i}`,
  names: [`Workflow ${String(i).padStart(3, '0')} Record With A Long Identifying Name`],
  primaryName: `Workflow ${String(i).padStart(3, '0')} Record With A Long Identifying Name`,
  type: 'person', authority: 'cn', status: 'active', country: 'Country fixture',
}))
async function setup(page) {
  await page.route('**/api/v1/search-index/manifest.json', route => route.fulfill({ json: {
    metadata: { totalEntities: entities.length, sources: 1, generated: '2026-10-15T00:00:00Z' },
    shards: [{ code: 'cn', file: 'workflow.json', count: entities.length }],
  } }))
  await page.route('**/api/v1/search-index/workflow.json', route => route.fulfill({ json: { entities } }))
  await page.route('**/api/v1/node/entity/cn/workflow-*.jsonld', route => {
    const ref = new URL(route.request().url()).pathname.split('/').pop().replace('.jsonld', '')
    const row = entities.find(entity => entity.ref === `cn/${ref}`)
    return route.fulfill({ json: { '@id': row.id, '@type': 'PersonEntity', entityType: 'person', names: [{ fullName: row.primaryName, isPrimary: true }], hasSanctionEntry: [] } })
  })
}
async function loaded(page, path = '/search') {
  await page.goto(path)
  await expect(page.getByTestId('search-count')).toContainText('175')
}
const routerPush = (page, path) => page.evaluate(path => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(path), path)

test('same-path navigation and history update query, filters and results together', async ({ page }) => {
  const errors = collectPageErrors(page)
  await setup(page)
  await loaded(page)
  await routerPush(page, '/search?q=Workflow%20042&type=person')
  await expect(page.getByRole('searchbox', { name: 'Search sanctions data' })).toHaveValue('Workflow 042')
  await expect(page.getByTestId('search-results').locator('> a')).toHaveCount(1)
  await expect(page.getByTestId('search-results')).toContainText('Workflow 042')
  await routerPush(page, '/search')
  await expect(page.getByRole('searchbox', { name: 'Search sanctions data' })).toHaveValue('')
  await expect(page.getByTestId('search-results').locator('> a')).toHaveCount(50)
  await page.goBack()
  await expect(page.getByTestId('search-results').locator('> a')).toHaveCount(1)
  await expect(page.getByRole('searchbox', { name: 'Search sanctions data' })).toHaveValue('Workflow 042')
  expect(errors).toEqual([])
})

test('record return restores loaded range, selected record and filtered query', async ({ page }) => {
  await setup(page)
  await loaded(page, '/search?q=Workflow&type=person')
  await page.getByRole('button', { name: /^Load More/ }).click()
  await page.getByRole('button', { name: /^Load More/ }).click()
  const card = page.locator('[data-entity-ref="cn/workflow-120"]')
  // Mount the loaded range explicitly; do not guess variable row heights.
  await page.getByRole('button', { name: 'Show all loaded results', exact: true }).click()
  await expect(card).toBeAttached()
  await card.scrollIntoViewIfNeeded()
  await card.click()
  await expect(page.getByRole('heading', { name: entities[120].primaryName, exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Back to results', exact: true }).click()
  await expect(card).toBeFocused()
  await expect(card).toBeInViewport()
  await expect(page.getByRole('searchbox', { name: 'Search sanctions data' })).toHaveValue('Workflow')
  expect(new URL(page.url()).searchParams.get('type')).toBe('person')
  await expect(page.getByRole('navigation', { name: 'Move through loaded results' })).toContainText('150 loaded')
  // Browser Back must restore the same stable query/range, too.
  await card.click()
  await expect(page.getByRole('heading', { name: entities[120].primaryName, exact: true })).toBeVisible()
  await page.goBack()
  await expect(card).toBeFocused()
  await expect(card).toBeInViewport()
  await expect(page.getByRole('navigation', { name: 'Move through loaded results' })).toContainText('150 loaded')
})

for (const width of [320, 820, 1280]) {
  test(`result navigation respects the viewport at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 })
    await setup(page)
    await loaded(page, '/search?type=person')
    const navigation = page.getByRole('navigation', { name: 'Move through loaded results' })
    const next = navigation.getByRole('button', { name: 'Next results', exact: true })
    await next.click()
    await expect(page.getByTestId('search-results').locator('> a:focus')).toBeInViewport()
    const firstIndex = Number(await page.getByTestId('search-results').locator('> a:focus').getAttribute('data-result-index'))
    if (width < 1024) await expect(next).toBeInViewport()
    else {
      expect(await navigation.evaluate(element => getComputedStyle(element).position)).toBe('static')
      await navigation.scrollIntoViewIfNeeded()
    }
    await next.click()
    const secondIndex = Number(await page.getByTestId('search-results').locator('> a:focus').getAttribute('data-result-index'))
    expect(secondIndex).toBeGreaterThan(firstIndex)
    const previous = navigation.getByRole('button', { name: 'Previous results', exact: true })
    await expect(previous).toBeEnabled()
    if (width >= 1024) await navigation.scrollIntoViewIfNeeded()
    await previous.click()
    await expect(page.getByTestId('search-results').locator('> a:focus')).toBeInViewport()
    const previousIndex = Number(await page.getByTestId('search-results').locator('> a:focus').getAttribute('data-result-index'))
    expect(previousIndex).toBeLessThan(secondIndex)
    if (width >= 1024) await navigation.scrollIntoViewIfNeeded()
    const clickable = await next.evaluate(element => {
      const rect = element.getBoundingClientRect()
      return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
    })
    expect(clickable).toBe(true)
    await expectNoHorizontalOverflow(page, `search ${width}`)
    if (width >= 1024) {
      for (let step = 0; step < 50 && await next.isEnabled(); step++) {
        await next.click()
        await navigation.scrollIntoViewIfNeeded()
      }
      await expect(next).toBeDisabled()
      const finalFocused = await page.getByTestId('search-results').locator('> a:focus').getAttribute('data-result-index')
      expect(Number(finalFocused)).toBeGreaterThanOrEqual(48)
      await page.getByRole('button', { name: 'Remove filter: Person' }).click()
      await expect(page.locator('aside button[aria-pressed]:focus')).toHaveCount(1)
    }
  })
}

test('a single result below a short phone viewport can be reached with Next', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 })
  await setup(page)
  await page.goto('/search?q=Workflow%20042')
  await expect(page.getByTestId('search-results').locator('> a')).toHaveCount(1)
  const next = page.getByRole('button', { name: 'Next results', exact: true })
  await expect(next).toBeEnabled()
  await next.click()
  await expect(page.getByTestId('search-results').locator('> a')).toBeFocused()
  await expect(page.getByTestId('search-results').locator('> a')).toBeInViewport()
})
