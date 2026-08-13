/**
 * The view models the entity page renders its sanction entries from.
 *
 * These cover the shipped transformation rather than a helper it happens
 * to call, for the reason given at the top of birthAdapters.test.js.
 *
 * Plain JavaScript against the emitted modules, for the reason spelled out
 * at the top of normalizeNode.test.js.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  entryPeriodRows,
  listingRemarks,
  NO_SCHEDULED_END_SENTINEL,
  NO_SCHEDULED_END_TEXT,
} from '../.test-build/utils/entryAdapters.js'
import { normalizeNode } from '../.test-build/utils/normalizeNode.js'

/**
 * LIVE — https://www.ammitto.org/api/v1/node/entry/tr/consolidated-list/1.jsonld,
 * fetched 2026-08-13. A listed date and no effective date: under the old
 * effective-date-only read this entry's block showed no date at all.
 */
const TR_1 = {
  '@id': 'https://www.ammitto.org/entry/tr/consolidated-list/1',
  '@type': 'SanctionEntry',
  period: { '@type': 'TemporalPeriod', listedDate: '2009-07-16', isIndefinite: true },
  status: 'active',
}

/**
 * LIVE — https://www.ammitto.org/api/v1/node/entry/eu/consolidated-list/eu100729.jsonld,
 * fetched 2026-08-13. Carries entry-level remarks the site was dropping.
 */
const EU_100729 = {
  '@id': 'https://www.ammitto.org/entry/eu/consolidated-list/eu100729',
  '@type': 'SanctionEntry',
  period: {
    '@type': 'TemporalPeriod',
    listedDate: '2023-05-04',
    effectiveDate: '2023-05-04',
    isIndefinite: true,
  },
  remarks: 'UNLI 27.04.2023',
}

/**
 * LIVE — https://www.ammitto.org/api/v1/node/entry/wb/debarment-list/100451.jsonld,
 * fetched 2026-08-13. Its expiry is the no-end sentinel, and its
 * `isIndefinite` says false beside it — the contradiction that keeps the
 * flag off the page.
 */
const WB_100451 = {
  '@id': 'https://www.ammitto.org/entry/wb/debarment-list/100451',
  '@type': 'SanctionEntry',
  period: {
    '@type': 'TemporalPeriod',
    effectiveDate: '2013-11-11',
    expiryDate: '2999-12-31',
    isIndefinite: false,
  },
}

const labelled = (rows) => Object.fromEntries(rows.map((r) => [r.label, r.value]))

test('an entry with only a listed date still shows a date', () => {
  // The defect: this block rendered nothing at all for these entries.
  const rows = entryPeriodRows([normalizeNode(TR_1)])
  assert.deepEqual(rows, [{ label: 'Listed Date', value: '2009-07-16' }])
})

test('a listed date is never relabelled as the effective date', () => {
  // The EU publishes listings whose measure takes effect the day after the
  // listing date. A fallback filling "Effective Date" from the listed date
  // would misdate every one of them by a day.
  const rows = entryPeriodRows([
    normalizeNode({ period: { listedDate: '2019-04-08', effectiveDate: '2019-04-09' } }),
  ])
  assert.deepEqual(labelled(rows), {
    'Listed Date': '2019-04-08',
    'Effective Date': '2019-04-09',
  })
})

test('the effective date keeps its own row and its own label', () => {
  const rows = entryPeriodRows([
    normalizeNode({ period: { effectiveDate: '2022-02-23' } }),
  ])
  assert.deepEqual(rows, [{ label: 'Effective Date', value: '2022-02-23' }])
})

test('rows are ordered listed, effective, expiry, last updated', () => {
  const rows = entryPeriodRows([
    normalizeNode({
      period: {
        lastUpdated: '2026-08-04',
        expiryDate: '2031-06-07',
        effectiveDate: '2012-06-29',
        listedDate: '2012-06-28',
      },
    }),
  ])
  assert.deepEqual(rows.map((r) => r.label), [
    'Listed Date',
    'Effective Date',
    'Expiry Date',
    'Listing Last Updated',
  ])
})

test('a real expiry date is shown as itself', () => {
  const rows = entryPeriodRows([
    normalizeNode({ period: { effectiveDate: '2026-06-08', expiryDate: '2031-06-07' } }),
  ])
  assert.equal(labelled(rows)['Expiry Date'], '2031-06-07')
})

test('the no-end sentinel is not rendered as a calendar date', () => {
  // Printing 2999-12-31 tells a reader the debarment lapses on a named day
  // nearly a millennium out, which is wrong in a way a blank is not.
  const rows = entryPeriodRows([normalizeNode(WB_100451)])
  assert.deepEqual(labelled(rows), {
    'Effective Date': '2013-11-11',
    'Expiry Date': NO_SCHEDULED_END_TEXT,
  })
  assert.equal(
    rows.some((r) => r.value.includes(NO_SCHEDULED_END_SENTINEL)),
    false,
    'the sentinel must not reach the page',
  )
})

test('the sentinel is only special as an expiry', () => {
  // Suppressing it wherever it appears would silently rewrite a stated
  // listing date; only the expiry field uses it as a no-end marker.
  const rows = entryPeriodRows([
    normalizeNode({ period: { listedDate: NO_SCHEDULED_END_SENTINEL } }),
  ])
  assert.deepEqual(rows, [{ label: 'Listed Date', value: NO_SCHEDULED_END_SENTINEL }])
})

test('the last-updated row says whose update it is', () => {
  // It moves when an authority amends the record. Under a bare "Last
  // Updated" a reader takes a maintenance edit for a sanctions action.
  const rows = entryPeriodRows([
    normalizeNode({ period: { listedDate: '2012-06-29', lastUpdated: '2026-08-04' } }),
  ])
  assert.equal(labelled(rows)['Listing Last Updated'], '2026-08-04')
  assert.equal(
    rows.some((r) => r.label === 'Last Updated'),
    false,
    'the bare label would read as a sanctions date',
  )
})

test('isIndefinite is not rendered as a row', () => {
  // Sources emit `false` on records whose expiry is the no-end sentinel,
  // so the flag contradicts the row above it.
  const rows = entryPeriodRows([normalizeNode({ period: { isIndefinite: true } })])
  assert.deepEqual(rows, [])
})

test('each field is resolved by its own scan across the entries', () => {
  // An entity carries several listings and the sources do not fill the
  // same fields on each. Tying every row to whichever entry answered first
  // would blank a row a later entry states.
  const rows = entryPeriodRows([
    normalizeNode({ period: { listedDate: '2019-04-08' } }),
    normalizeNode({ period: { effectiveDate: '2020-01-15', expiryDate: '2030-01-15' } }),
  ])
  assert.deepEqual(labelled(rows), {
    'Listed Date': '2019-04-08',
    'Effective Date': '2020-01-15',
    'Expiry Date': '2030-01-15',
  })
})

test('an entry with no period at all contributes no rows', () => {
  assert.deepEqual(entryPeriodRows([normalizeNode({ status: 'active' })]), [])
})

test('blank and non-string dates are treated as unstated', () => {
  assert.deepEqual(
    entryPeriodRows([normalizeNode({ period: { listedDate: '   ', effectiveDate: 1964 } })]),
    [],
  )
})

test('an absent or malformed entry list is empty rather than throwing', () => {
  assert.deepEqual(entryPeriodRows(undefined), [])
  assert.deepEqual(entryPeriodRows(null), [])
  assert.deepEqual(entryPeriodRows('nope'), [])
})

test("a listing's remarks survive to the page", () => {
  // The defect: entry-level remarks were declared nowhere and read nowhere.
  assert.deepEqual(listingRemarks([normalizeNode(EU_100729)]), ['UNLI 27.04.2023'])
})

test('listing remarks are kept even when the entity states none', () => {
  // Plenty of subjects carry listing remarks and no entity remarks, so the
  // page cannot go on gating this on the entity field.
  assert.deepEqual(
    listingRemarks([normalizeNode({ remarks: 'Japan End-User List - Export Control' })], null),
    ['Japan End-User List - Export Control'],
  )
})

test('remarks repeated from the entity are not printed twice', () => {
  assert.deepEqual(
    listingRemarks([normalizeNode({ remarks: 'Same text' })], 'Same text'),
    [],
  )
})

test('remarks that merely differ in punctuation are both kept', () => {
  // Deciding two differing strings mean the same thing would hide source
  // text; the headings already explain why the two look alike.
  const entity = 'Country: Belarus; Schedule: 1, Part 1.1; Item: 1; Date of Listing: 2022-03-08'
  assert.deepEqual(
    listingRemarks([normalizeNode({ remarks: 'Schedule: 1, Part 1.1, Item: 1' })], entity),
    ['Schedule: 1, Part 1.1, Item: 1'],
  )
})

test('one string repeated across entries is listed once', () => {
  assert.deepEqual(
    listingRemarks([
      normalizeNode({ remarks: 'Asset freeze' }),
      normalizeNode({ remarks: 'Asset freeze' }),
      normalizeNode({ remarks: 'Travel ban' }),
    ]),
    ['Asset freeze', 'Travel ban'],
  )
})

test('blank and non-string listing remarks are dropped', () => {
  assert.deepEqual(
    listingRemarks([
      normalizeNode({ remarks: '   ' }),
      normalizeNode({ remarks: 42 }),
      normalizeNode({ status: 'active' }),
    ]),
    [],
  )
})

test('an absent or malformed entry list yields no listing remarks', () => {
  assert.deepEqual(listingRemarks(undefined, 'x'), [])
  assert.deepEqual(listingRemarks(null), [])
  assert.deepEqual(listingRemarks('nope'), [])
})
