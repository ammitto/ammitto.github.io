import { test, expect } from '@playwright/test'
import { gotoRendered, expectNoHorizontalOverflow, useTheme } from './helpers.js'

test.use({ viewport: { width: 320, height: 800 } })

test('home search clears without submitting and the visible submit keeps the query', async ({ page }) => {
  await gotoRendered(page, '/')
  const input = page.getByRole('searchbox', { name: 'Name or alias', exact: true })
  await input.fill('General Dynamics')
  await page.getByRole('button', { name: 'Clear search', exact: true }).click()
  await expect(input).toHaveValue('')
  await expect(input).toBeFocused()
  expect(new URL(page.url()).pathname).toBe('/')

  await input.fill('  General Dynamics  ')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect.poll(() => new URL(page.url()).pathname).toBe('/search')
  expect(new URL(page.url()).searchParams.get('q')).toBe('General Dynamics')
})

test('mobile navigation restores its trigger on Escape and moves focus into a selected page', async ({ page }) => {
  await gotoRendered(page, '/')
  const trigger = page.getByRole('button', { name: 'Main menu', exact: true })
  const navigation = page.getByRole('navigation', { name: 'Mobile navigation', exact: true })
  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await navigation.getByRole('link', { name: 'Ontology', exact: true }).focus()
  await page.keyboard.press('Escape')
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(trigger).toBeFocused()
  await expect(navigation).toBeHidden()

  await trigger.click()
  await navigation.getByRole('link', { name: 'Ontology', exact: true }).click()
  await expect.poll(() => new URL(page.url()).pathname).toBe('/ontology')
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('#main-content')).toBeFocused()
})

for (const theme of ['light', 'dark']) {
  test(`desktop navigation remains usable at 200% text size (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await useTheme(page, theme)
    await gotoRendered(page, '/')
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
    const navigation = page.getByRole('navigation', { name: 'Main navigation', exact: true })
    for (const name of ['Home', 'Search', 'Browse', 'Ontology', 'API', 'Download', 'About', 'License']) {
      const link = navigation.getByRole('link', { name, exact: true })
      await expect(link).toBeVisible()
      await expect(link).toBeInViewport()
      const bounds = await link.boundingBox()
      expect(bounds.x).toBeGreaterThanOrEqual(0)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(1281)
    }
    const toggle = page.getByRole('button', { name: /Switch to .* mode/ })
    await expect(toggle).toBeInViewport()
    await expectNoHorizontalOverflow(page, `header at 200% text size ${theme}`)
    await navigation.getByRole('link', { name: 'About', exact: true }).click()
    await expect(page).toHaveURL(/\/about$/)
    await expect(page.locator('#main-content')).toBeFocused()
  })
}
