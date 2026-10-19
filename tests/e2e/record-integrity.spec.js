import { test, expect } from '@playwright/test'
import { collectPageErrors } from './helpers.js'

// Synthetic records exercise client failure/race behavior. They make no
// assertion about the status or completeness of the published corpus.
const base = 'https://www.ammitto.org/'
const iri = (kind, id) => `${base}${kind}/cn/${id}`
const nodePath = (kind, id) => `/api/v1/node/${kind}/cn/${id}.jsonld`
const entity = (id, name, entryIds = [`test/${id}`]) => ({
  '@id': iri('entity', id), '@type': 'PersonEntity', entityType: 'person',
  names: [{ fullName: name, isPrimary: true, script: 'Latn' }],
  hasSanctionEntry: entryIds.map(id => iri('entry', id)),
})
const entry = (id, extra = {}) => ({
  '@id': iri('entry', `test/${id}`), '@type': 'SanctionEntry',
  entityId: iri('entity', id), status: 'active', ...extra,
})
const group = {
  id: iri('group', 'integrity'), announcement_title: 'Integrity announcement',
  entity_count: 2, effective_date: '2024-12-05',
  entry_ids: [iri('entry', 'test/a'), iri('entry', 'test/b')],
}
const announcement = { title: 'Integrity announcement', content: 'Primary announcement text.', language: 'en' }
const fixture = () => new Map([
  [nodePath('entity', 'a'), entity('a', 'Record A')],
  [nodePath('entity', 'b'), entity('b', 'Record B')],
  [nodePath('entry', 'test/a'), entry('a', { announcement, legalBases: [{ '@id': iri('legal-instrument', 'law-a') }] })],
  [nodePath('entry', 'test/b'), entry('b', { status: 'delisted', announcement, legalBases: [{ '@id': iri('legal-instrument', 'law-b') }] })],
  [nodePath('group', 'integrity'), group],
  [nodePath('legal-instrument', 'law-a'), { '@id': iri('legal-instrument', 'law-a'), title: 'Law A', content: [{ type: 'clause', label: 'Article 1', content: ['Primary legal text.'] }] }],
  [nodePath('legal-instrument', 'law-b'), { '@id': iri('legal-instrument', 'law-b'), title: 'Law B', content: [{ type: 'clause', label: 'Article 1', content: ['Record B legal text.'] }] }],
  ['/api/v1/node/group/index.jsonld', { nodes: [{ '@id': group.id }] }],
])
const gate = () => {
  let release
  const wait = new Promise(resolve => { release = resolve })
  return { wait, release }
}
async function serve(page, nodes, before = async () => undefined) {
  await page.route('**/api/v1/node/**', async route => {
    const path = new URL(route.request().url()).pathname
    const status = await before(path)
    if (!nodes.has(path)) return route.continue()
    await route.fulfill({ status: status || 200, contentType: 'application/ld+json', body: JSON.stringify(nodes.get(path)) })
  })
}
async function navigate(page, path) {
  await page.evaluate(path => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(path), path)
}
async function settleResponse(page, response) {
  await response.finished()
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

test('a civil date keeps its source day west of UTC', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ timezoneId: 'America/Los_Angeles', baseURL })
  const page = await context.newPage()
  try {
    await serve(page, fixture())
    await page.goto('/group/cn/integrity')
    await expect(page.getByRole('heading', { name: 'Integrity announcement', exact: true })).toBeVisible()
    await expect(page.getByText('December 5, 2024', { exact: true })).toBeVisible()
    await expect(page.getByText('December 4, 2024', { exact: true })).toHaveCount(0)
  } finally { await context.close() }
})

test('unavailable listing evidence stays unknown and can be retried', async ({ page }) => {
  let unavailable = true
  await serve(page, fixture(), async path => path === nodePath('entry', 'test/a') && unavailable ? 503 : undefined)
  await page.goto('/entity/cn/a')
  await expect(page.getByRole('heading', { name: 'Record A', exact: true })).toBeVisible()
  await expect(page.getByText('Status unavailable', { exact: true })).toBeVisible()
  await expect(page.getByText(/Listing evidence is incomplete/)).toBeVisible()
  unavailable = false
  await page.getByRole('button', { name: 'Retry listing evidence' }).click()
  await expect(page.locator('.record-evidence').getByText('active', { exact: true })).toBeVisible()
  await expect(page.getByText(/Listing evidence is incomplete/)).toHaveCount(0)
})

test('an entity without names keeps its readable fallback', async ({ page }) => {
  const errors = collectPageErrors(page)
  const nodes = fixture()
  const unnamed = entity('a', 'Record A')
  delete unnamed.names
  nodes.set(nodePath('entity', 'a'), unnamed)
  await serve(page, nodes)
  await page.goto('/entity/cn/a')
  const heading = page.getByRole('heading', { name: 'Unknown', exact: true, level: 1 })
  await expect(heading).toBeVisible()
  await expect(heading).not.toHaveAttribute('lang')
  await expect(page.locator('.record-evidence').getByText('active', { exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('failed and malformed supporting labels retain identifiers and recover on retry', async ({ page }) => {
  const errors = collectPageErrors(page)
  const nodes = fixture()
  const authority = nodePath('organization', 'review-authority')
  const document = nodePath('document-type', 'review-document')
  nodes.set(nodePath('entry', 'test/a'), entry('a', {
    announcement: { ...announcement, authority: 'cn/review-authority', document_type: 'cn/review-document' },
  }))
  // A successful HTTP response can still contain an unusable label shape.
  nodes.set(authority, { name: 'Invalid name shape' })
  nodes.set(document, { name: [{ value: 'Review document', lang: 'en' }] })
  let unavailable = true
  await serve(page, nodes, async path => path === document && unavailable ? 503 : undefined)
  await page.goto('/entity/cn/a')
  await expect(page.getByText('2 supporting reference labels are unavailable.', { exact: false })).toBeVisible()
  await expect(page.getByRole('link', { name: 'cn/review-authority', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'cn/review-document', exact: true })).toBeVisible()
  nodes.set(authority, { name: [{ value: 'Review authority', lang: 'en' }] })
  unavailable = false
  await page.getByRole('button', { name: 'Retry reference labels', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Review authority', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Review document', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry reference labels', exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})

for (const stage of ['entity', 'entry', 'legal-instrument']) {
  test(`a stale ${stage} response cannot replace the current entity or evidence`, async ({ page }) => {
    const errors = collectPageErrors(page)
    const hold = gate()
    const seen = gate()
    const oldPath = nodePath(stage, stage === 'entity' ? 'a' : stage === 'entry' ? 'test/a' : 'law-a')
    await serve(page, fixture(), async path => {
      if (path === oldPath) { seen.release(); await hold.wait }
    })
    await page.goto('/entity/cn/a', { waitUntil: 'domcontentloaded' })
    await seen.wait
    if (stage !== 'entity') await expect(page.getByRole('heading', { name: 'Record A', exact: true })).toBeVisible()
    await navigate(page, '/entity/cn/b')
    await expect(page.getByRole('heading', { name: 'Record B', exact: true })).toBeVisible()
    await expect(page.locator('.record-evidence').getByText('delisted', { exact: true })).toBeVisible()
    const currentBasis = page.getByRole('link', { name: 'Law B', exact: true })
    await expect(currentBasis).toBeVisible()
    await expect(currentBasis).toHaveAttribute('href', '/legal-instrument/cn/law-b')
    const finished = page.waitForResponse(response => new URL(response.url()).pathname === oldPath)
    hold.release()
    await settleResponse(page, await finished)
    await expect(page).toHaveURL(/\/entity\/cn\/b$/)
    await expect(page.getByRole('heading', { name: 'Record B', exact: true })).toBeVisible()
    await expect(page.locator('.record-evidence').getByText('delisted', { exact: true })).toBeVisible()
    await expect(currentBasis).toBeVisible()
    await expect(currentBasis).toHaveAttribute('href', '/legal-instrument/cn/law-b')
    await expect(page.getByRole('link', { name: 'Law A', exact: true })).toHaveCount(0)
    expect(errors).toEqual([])
  })
}

for (const kind of ['group', 'announcement']) {
  test(`${kind} renders primary content before identities and reports missing children`, async ({ page }) => {
    const holdIdentity = gate()
    const identitySeen = gate()
    let failEntry = true
    await serve(page, fixture(), async path => {
      if (path === nodePath('entity', 'a')) { identitySeen.release(); await holdIdentity.wait }
      if (path === nodePath('entry', 'test/b') && failEntry) return 503
    })
    await page.goto(`/${kind}/cn/integrity`, { waitUntil: 'domcontentloaded' })
    await identitySeen.wait
    await expect(page.getByRole('heading', { name: 'Integrity announcement', exact: true })).toBeVisible()
    if (kind === 'announcement') await expect(page.getByText('Primary announcement text.', { exact: true })).toBeVisible()
    holdIdentity.release()
    await expect(page.getByText(/incomplete: 1 listing record/)).toBeVisible()
    failEntry = false
    await page.getByRole('button', { name: 'Retry related records' }).click()
    await expect(page.getByRole('heading', { name: 'Sanctioned Entities (2)', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: /Record B/ })).toBeVisible()
    await expect(page.getByText(/incomplete:/)).toHaveCount(0)
  })
}

test('legal text is readable while relationship discovery waits, with failure recovery', async ({ page }) => {
  const holdIndex = gate()
  const indexSeen = gate()
  let failIndex = true
  await serve(page, fixture(), async path => {
    if (path === '/api/v1/node/group/index.jsonld') {
      indexSeen.release(); await holdIndex.wait
      if (failIndex) return 503
    }
  })
  await page.goto('/legal-instrument/cn/law-a', { waitUntil: 'domcontentloaded' })
  await indexSeen.wait
  await expect(page.getByRole('heading', { name: 'Law A', exact: true })).toBeVisible()
  await expect(page.getByText('Primary legal text.', { exact: true })).toBeVisible()
  holdIndex.release()
  await expect(page.getByText(/Related sanctions are incomplete/)).toBeVisible()
  failIndex = false
  await page.getByRole('button', { name: 'Retry related sanctions' }).click()
  await expect(page.getByRole('link', { name: 'Integrity announcement', exact: true })).toBeVisible()
  await expect(page.getByText(/Related sanctions are incomplete/)).toHaveCount(0)
})
