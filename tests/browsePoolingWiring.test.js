/**
 * The browse pages must fetch their index nodes concurrently, and must say so
 * when some of them fail.
 *
 * Two regressions are pinned here, and neither is visible to a unit test of
 * the helpers themselves.
 *
 * FIRST, the waterfall. Each of these pages awaited one node at a time inside
 * a `for` loop and assigned the result only after the loop finished, so the
 * reader watched a spinner for the whole run. Measured against the live API on
 * 2026-09-01: the legal-instrument index holds 817 nodes at ~0.30s each, about
 * 4.6 minutes before anything rendered, against 4.8s pooled.
 *
 * SECOND, the silence. Pooling requires each task to catch its own failure —
 * one unreachable node should shorten the list, not empty it — but that means
 * a total outage arrives as an empty array, and the page would render its
 * "no results found" state for it. A sanctions register telling a reader the
 * dataset is empty, when the truth is that nothing could be reached, is the
 * same class of defect as a false negative in search.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')

const PAGES = [
  'src/views/BrowseLegalInstrumentsPage.vue',
  'src/views/BrowseGroupsPage.vue',
  'src/views/BrowseAnnouncementsPage.vue',
  'src/views/BrowseOrganizationsPage.vue',
  'src/views/BrowseDocumentTypesPage.vue',
]

for (const file of PAGES) {
  test(`${file} hydrates its index through the pool`, () => {
    const source = read(file)

    assert.match(
      source,
      /import \{ mapWithPool, BROWSE_INDEX_CONCURRENCY \} from '@\/utils\/entryFetchPool'/,
      `${file} must use the shared pool`,
    )
    assert.match(source, /await mapWithPool\(/, `${file} must pool its fetches`)
    assert.match(
      source,
      /BROWSE_INDEX_CONCURRENCY,/,
      `${file} must use the shared browse concurrency, not a local literal`,
    )
  })

  test(`${file} does not await its node fetches one at a time`, () => {
    const source = read(file)
    // The exact shape that was there before: an await inside a for-of over the
    // index nodes. A `for` loop elsewhere in the file is fine; this pins the
    // combination.
    const loop = source.match(/for \(const node of nodes\)[\s\S]{0,400}?await fetch/)
    assert.equal(
      loop,
      null,
      `${file} awaits a fetch inside a per-node loop again`,
    )
  })

  test(`${file} reports a failed load instead of rendering an empty dataset`, () => {
    const source = read(file)

    assert.match(
      source,
      /import \{ fetchNodeOnce, hydrationOutcome \} from '@\/utils\/indexHydration'/,
      `${file} must use the hydration helpers`,
    )
    // A total outage must set error, not fall through to the empty state.
    assert.match(
      source,
      /if \(outcome\.allFailed\) \{/,
      `${file} must distinguish "nothing loaded" from "nothing exists"`,
    )
    assert.match(
      source,
      /error\.value = 'Could not load /,
      `${file} must surface an error when every node failed`,
    )
    // A partial drop must be visible, since the page's totals come from what
    // was fetched.
    assert.match(
      source,
      /droppedCount\.value = outcome\.dropped/,
      `${file} must record how many nodes were dropped`,
    )
    assert.match(
      source,
      /droppedCount > 0/,
      `${file} must render a notice when the list is short`,
    )
  })
}
