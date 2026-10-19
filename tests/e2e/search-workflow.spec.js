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
  await expect(page.getByRole('navigation', { name: 'Move through loaded results' })).toContainText('of 150')
  // Browser Back must restore the same stable query/range, too.
  await card.click()
  await expect(page.getByRole('heading', { name: entities[120].primaryName, exact: true })).toBeVisible()
  await page.goBack()
  await expect(card).toBeFocused()
  await expect(card).toBeInViewport()
  await expect(page.getByRole('navigation', { name: 'Move through loaded results' })).toContainText('of 150')
})

for (const width of [320, 820, 1023, 1024, 1280]) {
  test(`result navigation respects the viewport at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 })
    await setup(page)
    await loaded(page, '/search?type=person')
    const navigation = page.getByRole('navigation', { name: 'Move through loaded results' })
    if (width >= 1024) {
      await expect(navigation.locator('.result-next')).toBeHidden()
      await expect(navigation.locator('.result-previous')).toBeHidden()
      await expect(page.getByRole('button', { name: /^(Next|Previous) results$/ })).toHaveCount(0)
      await expect(navigation).toContainText('of 50')
      await expect(page.getByTestId('search-results').locator('> a').first()).toBeVisible()
      await expect(navigation).toContainText('Visible results:')
      await page.evaluate(() => window.scrollBy(0, 700))
      await expect.poll(async () => navigation.evaluate(element => {
        const box = element.getBoundingClientRect()
        const header = document.querySelector('header').getBoundingClientRect()
        return Math.abs(box.top - header.bottom)
      })).toBeLessThan(2)
      await expect.poll(async () => Number((await navigation.locator('strong').innerText()).match(/Visible results: (\d+)/)?.[1])).toBeGreaterThan(1)
      const rowEnd = page.getByTestId('search-results').locator('> a').nth(4)
      await rowEnd.evaluate(element => {
        const counter = document.querySelector('.result-navigation').getBoundingClientRect()
        window.scrollBy(0, element.getBoundingClientRect().bottom - counter.bottom + 8)
      })
      // The reading area starts in a row gap; its preceding row is hidden.
      await expect.poll(async () => Number((await navigation.locator('strong').innerText()).match(/Visible results: (\d+)/)?.[1])).toBe(7)
      const range = await navigation.locator('strong').innerText()
      expect(range).toMatch(/^Visible results: \d+–\d+ of 50$/)
      expect(Number(range.match(/Visible results: (\d+)/)[1])).toBeGreaterThan(1)
      const card = page.getByTestId('search-results').locator('> a').nth(12)
      await card.focus()
      await expect.poll(async () => card.evaluate(element => element.getBoundingClientRect().top >= document.querySelector('.result-navigation').getBoundingClientRect().bottom - 1)).toBe(true)
      await page.getByRole('button', { name: 'Remove filter: Person' }).click()
      await expect(page.locator('aside button[aria-pressed]:focus')).toHaveCount(1)
      await expectNoHorizontalOverflow(page, `search ${width}`)
      return
    }
    const next = navigation.getByRole('button', { name: 'Next results', exact: true })
    await next.click()
    await expect(page.getByTestId('search-results').locator('> a:focus')).toBeInViewport()
    const firstIndex = Number(await page.getByTestId('search-results').locator('> a:focus').getAttribute('data-result-index'))
    await expect(next).toBeInViewport()
    await next.click()
    const secondIndex = Number(await page.getByTestId('search-results').locator('> a:focus').getAttribute('data-result-index'))
    expect(secondIndex).toBeGreaterThan(firstIndex)
    const previous = navigation.getByRole('button', { name: 'Previous results', exact: true })
    await expect(previous).toBeEnabled()
    await previous.click()
    await expect(page.getByTestId('search-results').locator('> a:focus')).toBeInViewport()
    const previousIndex = Number(await page.getByTestId('search-results').locator('> a:focus').getAttribute('data-result-index'))
    expect(previousIndex).toBeLessThan(secondIndex)
    const clickable = await next.evaluate(element => {
      const rect = element.getBoundingClientRect()
      return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
    })
    expect(clickable).toBe(true)
    await expectNoHorizontalOverflow(page, `search ${width}`)

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

test('visible range uses individual cards when a short card leaves a taller neighbour on screen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 700 })
  await setup(page)
  const varying = entities.map((entity, index) => index === 3 ? {
    ...entity,
    primaryName: 'Workflow 003 ' + 'A much longer organisation name with several identifying qualifications '.repeat(12),
    names: ['Workflow 003 ' + 'A much longer organisation name with several identifying qualifications '.repeat(12)],
  } : entity)
  await page.route('**/api/v1/search-index/workflow.json', route => route.fulfill({ json: { entities: varying } }))
  await loaded(page)
  await page.getByRole('button', { name: /^Load More/ }).click()
  await page.evaluate(() => window.scrollTo(0, 0))
  const grid = page.getByTestId('search-results')
  await expect(grid).toHaveAttribute('data-virtual', 'true')
  const short = grid.locator('[data-result-index="2"]')
  const tall = grid.locator('[data-result-index="3"]')
  await expect.poll(async () => (await tall.boundingBox()).height - (await short.boundingBox()).height).toBeGreaterThan(50)
  await short.evaluate(card => {
    const header = document.querySelector('header').getBoundingClientRect()
    const counter = document.querySelector('.result-navigation').getBoundingClientRect()
    window.scrollBy(0, card.getBoundingClientRect().bottom - header.bottom - counter.height + 8)
  })
  await expect.poll(async () => grid.evaluate(element => {
    const top = document.querySelector('.result-navigation').getBoundingClientRect().bottom
    return [...element.querySelectorAll('[data-result-index]')].filter(card => {
      const rect = card.getBoundingClientRect()
      return rect.bottom > top && rect.top < innerHeight
    }).map(card => Number(card.dataset.resultIndex) + 1)[0]
  })).toBe(4)
  await expect(page.locator('.result-range strong')).toHaveText(/^Visible results: 4–\d+ of 100$/)
  const actualRange = () => grid.evaluate(element => {
    const top = Math.max(document.querySelector('header').getBoundingClientRect().bottom,
      document.querySelector('.result-navigation').getBoundingClientRect().bottom,
      parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0)
    const visible = [...element.querySelectorAll('[data-result-index]')].filter(card => {
      const rect = card.getBoundingClientRect()
      return rect.height > 0 && rect.bottom > top && rect.top < innerHeight
    }).map(card => Number(card.dataset.resultIndex) + 1)
    return `Visible results: ${Math.min(...visible)}–${Math.max(...visible)} of 100`
  })
  await expect.poll(async () => (await page.locator('.result-range strong').innerText()) === await actualRange()).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('mixed-height-desktop.png') })
  await page.setViewportSize({ width: 1024, height: 700 })
  await expect.poll(async () => (await page.locator('.result-range strong').innerText()) === await actualRange()).toBe(true)
})

for (const width of [390, 820]) {
  test(`Next ends at Load More without revealing the footer at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 })
    await setup(page)
    await loaded(page)
    const next = page.getByRole('button', { name: 'Next results', exact: true })
    for (let step = 0; step < 60; step++) {
      await expect(page.locator('.result-list-region')).toHaveAttribute('aria-busy', 'false')
      if (await next.isDisabled()) break
      await next.click()
    }
    await expect(next).toBeDisabled()
    const more = page.getByRole('button', { name: /^Load More/ })
    await expect(more).toBeInViewport()
    const bottom = await page.evaluate(() => ({
      footer: document.querySelector('footer').getBoundingClientRect().top,
      viewport: innerHeight,
      more: [...document.querySelectorAll('button')].find(button => button.textContent.trim().startsWith('Load More')).getBoundingClientRect().bottom,
      controls: document.querySelector('.result-navigation').getBoundingClientRect().top,
    }))
    expect(bottom.more).toBeLessThanOrEqual(bottom.controls)
    expect(bottom.footer).toBeGreaterThanOrEqual(bottom.controls)
    const filterGeometry = await page.getByTestId('applied-filters-bar').evaluate(bar => {
      const b = bar.getBoundingClientRect()
      const button = [...bar.querySelectorAll('button')].find(button => button.getAttribute('aria-haspopup') === 'dialog').getBoundingClientRect()
      return { gap: b.top - document.querySelector('header').getBoundingClientRect().bottom,
        above: button.top - b.top, below: b.bottom - button.bottom, height: button.height }
    })
    expect(Math.abs(filterGeometry.gap)).toBeLessThanOrEqual(1)
    expect(filterGeometry.above).toBeGreaterThanOrEqual(8)
    expect(filterGeometry.below).toBeGreaterThanOrEqual(8)
    expect(filterGeometry.height).toBeGreaterThanOrEqual(44)
    await page.screenshot({ path: testInfo.outputPath('last-results.png') })
    await page.mouse.wheel(0, 600)
    await expect(page.locator('footer')).toBeInViewport()
  })
}

test('Next stops at the final result when no Load More button remains', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page)
  await page.goto('/search?q=Workflow%2000')
  await expect(page.getByTestId('search-results').locator('> a')).toHaveCount(10)
  await expect(page.getByRole('button', { name: /^Load More/ })).toHaveCount(0)
  const next = page.getByRole('button', { name: 'Next results', exact: true })
  for (let step = 0; step < 15; step++) {
    await expect(page.locator('.result-list-region')).toHaveAttribute('aria-busy', 'false')
    if (await next.isDisabled()) break
    await next.click()
  }
  await expect(next).toBeDisabled()
  const geometry = await page.evaluate(() => ({
    footer: document.querySelector('footer').getBoundingClientRect().top,
    controls: document.querySelector('.result-navigation').getBoundingClientRect().top,
    last: document.querySelector('[data-result-index="9"]').getBoundingClientRect().bottom,
  }))
  expect(geometry.last).toBeLessThanOrEqual(geometry.controls)
  expect(geometry.footer).toBeGreaterThanOrEqual(geometry.controls)
  await page.mouse.wheel(0, 600)
  await expect(page.locator('footer')).toBeInViewport()
})


test('Next advances through an oversized final card on a short phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 })
  await setup(page)
  const rows = entities.slice(0, 3).map((entity, index) => index === 2 ? {
    ...entity,
    primaryName: 'Workflow 002 ' + 'Long identifying organisation name '.repeat(50),
    names: ['Workflow 002 ' + 'Long identifying organisation name '.repeat(50)],
  } : entity)
  await page.route('**/api/v1/search-index/workflow.json', route => route.fulfill({ json: { entities: rows } }))
  await page.goto('/search')
  await expect(page.getByTestId('search-results').locator('> a')).toHaveCount(3)
  const next = page.getByRole('button', { name: 'Next results', exact: true })
  for (let step = 0; step < 20; step++) {
    await expect(page.locator('.result-list-region')).toHaveAttribute('aria-busy', 'false')
    if (await next.isDisabled()) break
    await next.click()
  }
  await expect(page.locator('.result-list-region')).toHaveAttribute('aria-busy', 'false')
  await expect(next).toBeDisabled()
  const last = page.locator('[data-result-index="2"]')
  expect(await last.evaluate(card => card.getBoundingClientRect().height)).toBeGreaterThan(480)
  const endpoint = await last.evaluate(card => ({ bottom: card.getBoundingClientRect().bottom,
    controls: document.querySelector('.result-navigation').getBoundingClientRect().top }))
  expect(endpoint.bottom).toBeLessThanOrEqual(endpoint.controls)
})
