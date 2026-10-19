import { test, expect } from '@playwright/test'
import { collectPageErrors, expectNoHorizontalOverflow, gotoRendered as gotoRenderedBase, useTheme } from './helpers.js'

async function gotoRendered(page, path) {
  await gotoRenderedBase(page, path)
}

async function graphReady(page) {
  await expect(page.getByRole('group', { name: 'Ontology class graph', exact: true })).toHaveAttribute('data-ready', 'true')
  return page.getByRole('group', { name: 'Ontology class graph', exact: true })
}
async function tabTo(page, selector) {
  for (let i = 0; i < 100; i += 1) {
    await page.keyboard.press('Tab')
    if (await page.locator(selector).evaluate(el => el === document.activeElement)) return
  }
  throw new Error(`Keyboard could not reach ${selector}`)
}

test('search does not load the graph chunk; opening the ontology loads it on demand', async ({ page }) => {
  const graphRequests = []
  page.on('request', request => {
    if (/\/OntologyGraph-[^/]+\.(js|css)(?:\?|$)/.test(request.url())) graphRequests.push(request.url())
  })
  await gotoRendered(page, '/search')
  expect(graphRequests).toEqual([])
  await gotoRendered(page, '/ontology')
  await graphReady(page)
  expect(graphRequests.some(url => /\.js(?:\?|$)/.test(url))).toBe(true)
})

test('graph nodes and hierarchy share class details with the preserved hierarchy and tabs', async ({ page }) => {
  const errors = collectPageErrors(page)
  const requests = []
  page.on('request', request => requests.push(request.url()))
  await gotoRendered(page, '/ontology')
  await graphReady(page)
  // A graph fitted around an escaped disconnected component made every class
  // label only a few pixels high despite selection still working.
  const nodeHeights = await page.locator('.graph-node').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height))
  expect(Math.min(...nodeHeights)).toBeGreaterThan(20)
  await page.getByRole('button', { name: 'View Person Entity class', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Person Entity', exact: true })).toBeVisible()
  await expect(page.locator('.hierarchy-select[aria-current="true"] .hierarchy-label')).toHaveText('Person')
  await expect(page.getByRole('combobox')).toHaveCount(0)
  await expect(page.getByRole('listitem').filter({ hasText: /^Person Entity → subclass of → Entity$/ })).toBeVisible()

  await page.getByRole('button', { name: 'Authority', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Authority', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'View Authority class', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('tab', { name: 'Properties', exact: true }).click()
  await expect(page.getByRole('searchbox', { name: 'Search properties', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Classes', exact: true }).click()
  await page.getByRole('button', { name: 'View Entity class', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Entity', exact: true })).toBeVisible()
  expect(requests.filter(url => /\/all\.jsonld(?:\?|$)|\/sources\/[^/]+\.jsonld/.test(url))).toEqual([])
  expect(errors).toEqual([])
})

test('keyboard can select a node, pan, zoom and reset without losing the chosen class', async ({ page }) => {
  await gotoRendered(page, '/ontology')
  const graph = await graphReady(page)
  await tabTo(page, 'svg[aria-label="Ontology class graph"]')
  const initial = await page.locator('.graph-viewport').getAttribute('transform')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.graph-viewport')).not.toHaveAttribute('transform', initial)
  const beforeZoom = Number(await graph.getAttribute('data-scale'))
  await page.keyboard.press('+')
  await expect.poll(async () => Number(await graph.getAttribute('data-scale'))).toBeGreaterThan(beforeZoom)
  await page.keyboard.press('Home')
  await expect(page.locator('.graph-viewport')).toHaveAttribute('transform', initial)
  await tabTo(page, '.graph-node[aria-label="View Entity class"]')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Entity', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect(page.getByRole('button', { name: 'View Entity class', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Fit to view', exact: true }).click()
  await expect(page.locator('.graph-viewport')).toHaveAttribute('transform', initial)
})

test('mobile dark reduced-motion graph stays settled, selectable and within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await useTheme(page, 'dark')
  await gotoRendered(page, '/ontology')
  await graphReady(page)
  const colors = await page.locator('.ontology-graph').evaluate(graph => {
    const button = graph.querySelector('.graph-controls button')
    const rect = graph.querySelector('.graph-node rect')
    const text = graph.querySelector('.graph-node text')
    const expected = token => `rgb(${getComputedStyle(graph).getPropertyValue(token).trim().split(/\s+/).join(', ')})`
    return {
      button: getComputedStyle(button).color, text: getComputedStyle(text).fill,
      node: getComputedStyle(rect).fill,
      expectedText: expected('--color-dark-text'), expectedSurface: expected('--color-dark-surface'),
    }
  })
  expect(colors.button).toBe(colors.expectedText)
  expect(colors.text).toBe(colors.expectedText)
  expect(colors.node).toBe(colors.expectedSurface)
  const positions = await page.locator('.graph-node').evaluateAll(nodes => nodes.map(node => node.getAttribute('transform')))
  await page.getByRole('button', { name: 'View Vessel Entity class', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Vessel Entity', exact: true })).toBeVisible()
  expect(await page.locator('.graph-node').evaluateAll(nodes => nodes.map(node => node.getAttribute('transform')))).toEqual(positions)
  await expectNoHorizontalOverflow(page, '/ontology graph at 320px')
})

test('the actual ontology page preserves both explicit domains of a repeated property ID', async ({ page }) => {
  await gotoRendered(page, '/ontology')
  await graphReady(page)
  await page.getByRole('button', { name: 'View Authority class', exact: true }).click()
  const relationships = page.locator('.ontology-graph').getByRole('listitem')
  await expect(relationships.filter({ hasText: /^Sanction Entry → Authority → Authority$/ })).toBeVisible()
  await expect(relationships.filter({ hasText: /^Sanctions List → Authority → Authority$/ })).toBeVisible()
})

test('Tab and Shift+Tab reveal the whole focused node after canvas pan and zoom', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await gotoRendered(page, '/ontology')
  const graph = await graphReady(page)
  await page.getByRole('button', { name: 'View Entity class', exact: true }).click()
  await tabTo(page, 'svg[aria-label="Ontology class graph"]')
  await page.keyboard.press('+')
  const zoom = await graph.getAttribute('data-scale')
  for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowRight')
  const entity = page.getByRole('button', { name: 'View Entity class', exact: true })
  const canvas = await page.locator('.graph-canvas').boundingBox()
  const clipped = await entity.boundingBox()
  expect(clipped.x + clipped.width).toBeLessThan(canvas.x)

  async function expectFocusedNodeVisible() {
    const active = page.locator('.graph-node:focus')
    await expect(active).toBeFocused()
    const bounds = await active.boundingBox()
    const canvas = await page.locator('.graph-canvas').boundingBox()
    expect(bounds.x).toBeGreaterThanOrEqual(canvas.x + 2)
    expect(bounds.y).toBeGreaterThanOrEqual(canvas.y + 2)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(canvas.x + canvas.width - 2)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(canvas.y + canvas.height - 2)
    await expect(graph).toHaveAttribute('data-scale', zoom)
    await expect(entity).toHaveAttribute('aria-pressed', 'true')
  }
  await page.keyboard.press('Tab')
  await expect(entity).toBeFocused()
  await expectFocusedNodeVisible()
  await page.keyboard.press('Tab')
  await expectFocusedNodeVisible()
  await page.keyboard.press('Shift+Tab')
  await expect(entity).toBeFocused()
  await expectFocusedNodeVisible()
})

test('graph controls stack inside the canvas and help is keyboard dismissible', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await gotoRendered(page, '/ontology')
  await graphReady(page)
  const help = page.getByRole('button', { name: 'Graph help', exact: true })
  const instructions = page.locator('#ontology-graph-help')
  await expect(help).toHaveAttribute('aria-expanded', 'false')
  await expect(instructions).toBeHidden()
  await help.focus()
  await page.keyboard.press('Enter')
  await expect(help).toHaveAttribute('aria-expanded', 'true')
  await expect(instructions).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(instructions).toBeHidden()
  await expect(help).toBeFocused()
  await page.keyboard.press('Space')
  await expect(instructions).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(instructions).toBeHidden()
  const geometry = await page.locator('.graph-controls button').evaluateAll(buttons => buttons.map(button => {
    const bounds = button.getBoundingClientRect()
    const canvas = button.closest('.graph-canvas').getBoundingClientRect()
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
      inside: bounds.left >= canvas.left && bounds.right <= canvas.right && bounds.top >= canvas.top && bounds.bottom <= canvas.bottom }
  }))
  expect(geometry).toHaveLength(3)
  for (let index = 0; index < geometry.length; index++) {
    expect(geometry[index].inside).toBe(true)
    expect(geometry[index].width).toBeGreaterThanOrEqual(44)
    expect(geometry[index].height).toBeGreaterThanOrEqual(44)
    expect(geometry[index].x).toBe(geometry[0].x)
    if (index) expect(geometry[index].y).toBeGreaterThanOrEqual(geometry[index - 1].y + geometry[index - 1].height)
  }
  await expectNoHorizontalOverflow(page, '/ontology vertical controls at 320px')
})
