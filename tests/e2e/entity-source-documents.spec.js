import { test, expect } from '@playwright/test'
import { collectPageErrors, gotoRendered } from './helpers.js'

test('an entity with no source references still offers its source aggregate', async ({ page }) => {
  const errors = collectPageErrors(page)
  await gotoRendered(page, '/entity/cn/1-general-dynamics')

  await expect(page.locator('a[download="cn-1-general-dynamics.jsonld"]')).toHaveAttribute(
    'href',
    '/api/v1/node/entity/cn/1-general-dynamics.jsonld',
  )
  await expect(page.locator('a[download="cn.jsonld"]')).toHaveAttribute(
    'href',
    '/api/v1/sources/cn.jsonld',
  )
  expect(errors).toEqual([])
})
