import { test, expect } from '@playwright/test'
import { gotoRendered, expectNoHorizontalOverflow } from './helpers.js'

test('CN coverage distinguishes source announcements, repository snapshots and unknown imports', async ({ page }) => {
  await page.route('**/source-freshness.json', route => route.fulfill({ json: {
    cn: {
      latestIncludedAnnouncementDate: '2026-02-24',
      sourceSnapshotCommit: 'a'.repeat(40),
      sourceSnapshotCommittedAt: '2026-10-12T15:21:15Z',
      snapshotBuiltAt: '2026-10-15T13:00:00Z',
      lastManualImportAt: null,
      lastOfficialSourceCheckAt: null,
    },
  } }))
  await page.setViewportSize({ width: 320, height: 800 })
  await gotoRendered(page, '/sources')
  const freshness = page.getByRole('group', { name: 'China source freshness', exact: true })
  await expect(freshness).toContainText('Latest included source announcement: 2026-02-24')
  await expect(freshness.getByRole('link')).toHaveAttribute('href', `https://github.com/ammitto/data-cn/commit/${'a'.repeat(40)}`)
  await expect(freshness).toContainText('Last manual import: not recorded')
  await expect(freshness).toContainText('Last check of official sources: not recorded')
  await expect(freshness).toContainText('Newer official announcements may need manual import')
  await expectNoHorizontalOverflow(page)
})

test('missing provenance never falls back to the site build date', async ({ page }) => {
  await page.route('**/source-freshness.json', route => route.fulfill({ status: 404, body: '{}' }))
  await gotoRendered(page, '/sources')
  const freshness = page.getByRole('group', { name: 'China source freshness', exact: true })
  await expect(freshness).toContainText('Latest included source announcement: not recorded')
  await expect(freshness.getByRole('link')).toHaveCount(0)
  await expect(freshness).toContainText('Last manual import: not recorded')
})
