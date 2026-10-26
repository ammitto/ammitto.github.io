import { test, expect } from '@playwright/test'

for (const path of ['/api', '/ruby', '/schema']) {
  test(`${path} keeps documentation static and hydrates only code controls`, async ({ page }) => {
    await page.goto(path)
    await expect(page.locator('main h1')).toBeVisible()
    const islands = page.locator('astro-island')
    expect(await islands.count()).toBeGreaterThan(0)
    for (const url of await islands.evaluateAll(nodes => nodes.map(node => node.getAttribute('component-url')))) {
      expect(url).toMatch(/\/CodeBlock[.-]/)
    }
    const firstCopy = page.getByRole('button', { name: /^Copy / }).first()
    await expect(firstCopy).toBeEnabled()
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toHaveCount(1)
  })
}

for (const path of ['/about', '/license']) {
  test(`${path} needs no Vue runtime for the header or content`, async ({ page }) => {
    await page.goto(path)
    await expect(page.locator('main h1')).toBeVisible()
    await expect(page.locator('astro-island')).toHaveCount(0)
    const dark = await page.locator('html').evaluate(node => node.classList.contains('dark'))
    await page.getByRole('button', { name: /Switch to .* mode/ }).click()
    await expect.poll(() => page.locator('html').evaluate(node => node.classList.contains('dark'))).toBe(!dark)
  })
}

test('documentation remains readable without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL })
  try {
    const page = await context.newPage()
    for (const path of ['/api', '/ruby', '/schema']) {
      await page.goto(path)
      await expect(page.locator('main h1')).toBeVisible()
      await expect(page.locator('main pre code').first()).not.toBeEmpty()
      await expect(page.getByRole('button', { name: /^Copy / }).first()).toBeDisabled()
    }
  } finally { await context.close() }
})

for (const blockedStorage of [false, true]) {
  test(`footer navigation transfers focus with session storage ${blockedStorage ? 'blocked' : 'available'}`, async ({ page }) => {
    if (blockedStorage) await page.addInitScript(() => {
      Object.defineProperty(window, 'sessionStorage', { configurable: true, get() { throw new DOMException('Blocked', 'SecurityError') } })
    })
    await page.goto('/api')
    await page.locator('footer').getByRole('link', { name: 'About', exact: true }).click()
    await expect(page).toHaveURL(/\/about\/?$/)
    await expect(page.locator('#main-content')).toBeFocused()
  })
}

for (const path of ['/search', '/search/']) {
  test(`${path} resolves and query edits stay in the same document`, async ({ page }) => {
    await page.goto(`${path}?q=General%20Dynamics`)
    const search = page.getByRole('searchbox', { name: 'Search sanctions data', exact: true })
    await expect(search).toHaveValue('General Dynamics')
    await page.evaluate(() => { window.__documentMarker = 'same document' })
    await search.fill('General')
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('General')
    expect(await page.evaluate(() => window.__documentMarker)).toBe('same document')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.ammitto.org/search/')
  })
}

test('failed detail component download offers a working reload', async ({ page }) => {
  await page.route('**/assets/GroupPage*.js', route => route.abort())
  await page.goto('/group/cn/14', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('alert')).toContainText('This page could not load')
  await page.unroute('**/assets/GroupPage*.js')
  await page.getByRole('button', { name: 'Reload page', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.locator('main h1')).toBeVisible()
  await expect(page.locator('a[download="cn-14.jsonld"]')).toHaveAttribute('href', '/api/v1/node/group/cn/14.jsonld')
})

test('a pending detail component keeps a visible loading state', async ({ page }) => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  await page.route('**/assets/GroupPage*.js', async route => { await gate; await route.continue() })
  try {
    await page.goto('/group/cn/14', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('status')).toHaveText('Loading record…')
    release()
    await expect(page.locator('main h1')).toBeVisible()
  } finally { release() }
})
