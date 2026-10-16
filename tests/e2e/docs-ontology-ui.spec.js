import { test, expect } from '@playwright/test'
import { collectPageErrors, expectNoHorizontalOverflow, gotoRendered, serveSourceGraphs, useTheme } from './helpers.js'

test('ontology property search filters, explains empty results, and survives reload', async ({ page }) => {
  const errors = collectPageErrors(page)
  await gotoRendered(page, '/ontology?tab=properties')
  const panel = page.getByRole('tabpanel', { name: 'Properties', exact: true })
  await expect(panel.locator('article').first()).toBeVisible()
  const originalCount = await panel.locator('article').count()
  const search = page.getByRole('searchbox', { name: 'Search properties' })
  await search.fill('zzzz-no-such-property')
  await expect(panel.locator('article')).toHaveCount(0)
  await expect(panel.getByRole('status')).toHaveText(`0 of ${originalCount} properties`)
  await expect(panel).toContainText('No properties match')
  await expect(page).toHaveURL(/property-search=zzzz-no-such-property/)
  await page.reload()
  await expect(search).toHaveValue('zzzz-no-such-property')
  await expect(panel.locator('article')).toHaveCount(0)
  await search.fill('')
  await expect(panel.locator('article')).toHaveCount(originalCount)
  expect(errors).toEqual([])
})

test('cold ontology examples load, and a failed selected example can be retried', async ({ page }) => {
  let attempts = 0
  await page.route('**/api/v1/ontology/examples/vessel.jsonld', route => {
    attempts += 1
    return attempts === 1
      ? route.fulfill({ status: 503, body: 'Unavailable' })
      : route.fulfill({ json: { '@id': 'vessel-example', name: 'Vessel fixture' } })
  })
  await gotoRendered(page, '/ontology?tab=examples&example=vessel')
  await expect(page.getByRole('tabpanel', { name: 'Examples', exact: true }).getByRole('button', { name: 'Vessel', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('alert')).toContainText('vessel example could not be loaded')
  await page.getByRole('button', { name: 'Retry example' }).click()
  await expect(page.locator('pre code')).toContainText('Vessel fixture')
  expect(attempts).toBe(2)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('a late example response cannot replace a more recent selection', async ({ page }) => {
  let releasePerson
  let personStarted = false
  const personGate = new Promise(resolve => { releasePerson = resolve })
  await page.route('**/api/v1/ontology/examples/person.jsonld', async route => {
    personStarted = true
    await personGate
    await route.fulfill({ json: { '@id': 'person-example', name: 'Late person fixture' } })
  })
  await page.route('**/api/v1/ontology/examples/organization.jsonld', route =>
    route.fulfill({ json: { '@id': 'organization-example', name: 'Organization fixture' } }),
  )
  // A held request intentionally prevents network-idle; wait for the control instead.
  await page.goto('/ontology?tab=examples', { waitUntil: 'domcontentloaded' })
  await expect.poll(() => personStarted).toBe(true)
  await expect(page.getByRole('status')).toContainText('Loading person example')
  await page.getByRole('tabpanel', { name: 'Examples', exact: true }).getByRole('button', { name: 'Organization', exact: true }).click()
  await expect(page.locator('pre code')).toContainText('Organization fixture')
  const lateResponse = page.waitForResponse('**/api/v1/ontology/examples/person.jsonld')
  releasePerson()
  await (await lateResponse).finished()
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await expect(page.locator('pre code')).toContainText('Organization fixture')
  await expect(page.locator('pre code')).not.toContainText('Late person fixture')
  await expect(page.getByRole('tabpanel', { name: 'Examples', exact: true }).getByRole('button', { name: 'Organization', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page).toHaveURL(/example=organization/)
})

test('ontology tabs expose selection and keyboard navigation, with a visible graph and no duplicate class input', async ({ page }) => {
  await gotoRendered(page, '/ontology?class=PersonEntity')
  await expect(page.getByRole('heading', { name: 'Person Entity', exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Ontology class graph', exact: true })).toHaveAttribute('data-ready', 'true')
  await expect(page.getByRole('combobox')).toHaveCount(0)
  const classes = page.getByRole('tab', { name: 'Classes', exact: true })
  await classes.focus()
  await page.keyboard.press('ArrowRight')
  const properties = page.getByRole('tab', { name: 'Properties', exact: true })
  await expect(properties).toBeFocused()
  await expect(properties).toHaveAttribute('aria-selected', 'true')
  await expect(classes).toHaveAttribute('aria-selected', 'false')
  await page.keyboard.press('Home')
  await expect(classes).toBeFocused()
  await expect(page.getByRole('heading', { name: 'Person Entity', exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Ontology class graph', exact: true })).toHaveAttribute('data-ready', 'true')
})

test('clipboard denial offers visible recovery and selects the intended snippet', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => { throw new DOMException('Denied', 'NotAllowedError') } },
    })
  })
  await gotoRendered(page, '/api')
  const copy = page.getByRole('button', { name: 'Copy Base URL', exact: true })
  await copy.click()
  const block = copy.locator('..').locator('..')
  await expect(block.getByRole('status')).toContainText('Clipboard access is unavailable')
  await block.getByRole('button', { name: 'Select code', exact: true }).click()
  await expect(block.getByRole('region', { name: 'Base URL code', exact: true })).toBeFocused()
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(await block.locator('code').innerText())
})

for (const [path, labels] of [
  ['/schema', ['Field Descriptions']],
  ['/ruby', ['API Reference', 'Working with results', 'Configuration Options']],
]) {
  test(`${path} tables scroll from the keyboard at 320px`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await useTheme(page, 'dark')
    await gotoRendered(page, path)
    for (const label of labels) {
      const region = page.getByRole('region', { name: label, exact: true })
      await expect(region).toHaveAttribute('tabindex', '0')
      expect(await region.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true)
      await region.focus()
      await page.keyboard.press('ArrowRight')
      await expect.poll(() => region.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
      // Every rightmost cell must be inside the scrollable extent, not clipped by a parent.
      const bounds = await region.evaluate(element => {
        element.scrollLeft = element.scrollWidth
        return { right: element.getBoundingClientRect().right, last: element.querySelector('tr:last-child td:last-child').getBoundingClientRect().right }
      })
      expect(bounds.last).toBeLessThanOrEqual(bounds.right + 1)
    }
    await expectNoHorizontalOverflow(page, `${path} tables at 320px`)
  })
}

test('browse entity filters restore from the URL and aggregate rows make no active-status claim', async ({ page, request }) => {
  await serveSourceGraphs(page, request)
  await gotoRendered(page, '/browse/entities?type=organization&page=2')
  const types = page.getByRole('group', { name: 'Entity type', exact: true })
  await expect(types.getByRole('button', { name: /Organization/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-entity-ref]').first()).toBeVisible()
  await expect(page.locator('[data-entity-ref]').first()).toContainText('Listing status unavailable')
  await types.getByRole('button', { name: /^All/ }).click()
  await expect(page).not.toHaveURL(/type=organization/)
  await page.goBack()
  await expect(types.getByRole('button', { name: /Organization/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page).toHaveURL(/page=2/)
  await page.reload()
  await expect(types.getByRole('button', { name: /Organization/ })).toHaveAttribute('aria-pressed', 'true')
})
