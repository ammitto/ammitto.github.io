import { test, expect } from '@playwright/test'
import { collectPageErrors } from './helpers.js'

test('a slower old detail response cannot overwrite a newer route', async ({ page }) => {
  const errors = collectPageErrors(page)
  let releaseOldResponse = () => {}
  const oldResponseGate = new Promise((resolve) => {
    releaseOldResponse = resolve
  })
  let markOldRequestSeen = () => {}
  const oldRequestSeen = new Promise((resolve) => {
    markOldRequestSeen = resolve
  })

  await page.route('**/api/v1/node/group/cn/14.jsonld', async (route) => {
    markOldRequestSeen()
    const response = await route.fetch()
    await oldResponseGate
    await route.fulfill({ response })
  })

  await page.goto('/group/cn/14', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('#app')).toBeVisible()
  await oldRequestSeen

  await page.evaluate(async (destination) => {
    const app = document.querySelector('#app')?.__vue_app__
    if (!app) throw new Error('Vue application instance is unavailable')
    await app.config.globalProperties.$router.push(destination)
  }, '/group/cn/15')

  const heading = page.locator('h1')
  await expect(page).toHaveURL(/\/group\/cn\/15$/)
  await expect(heading).toHaveText('关于对加拿大机构及人员采取反制措施的决定')

  const oldResponseFinished = page.waitForResponse(
    (response) => response.url().endsWith('/api/v1/node/group/cn/14.jsonld'),
  )
  releaseOldResponse()
  await oldResponseFinished

  await expect(heading).toHaveText('关于对加拿大机构及人员采取反制措施的决定')
  await expect(page.locator('a[download="cn-15.jsonld"]')).toHaveAttribute(
    'href',
    '/api/v1/node/group/cn/15.jsonld',
  )
  expect(errors).toEqual([])
})
