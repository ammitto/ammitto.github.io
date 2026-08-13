/**
 * The identification table the entity page renders.
 *
 * The fixtures are whole `identifications` arrays copied from published
 * node files and pushed through `normalizeNode` first, because the bug
 * being fixed was a vocabulary mismatch: the page read field names the
 * producer has never emitted. Asserting against hand-written snake_case
 * records would have passed just as happily while the site showed a dash.
 *
 * Plain JavaScript against the emitted modules, for the reason spelled out
 * at the top of normalizeNode.test.js.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { identificationTable } from '../.test-build/utils/identificationDisplay.js'
import { normalizeNode } from '../.test-build/utils/normalizeNode.js'

/** A published node's identifications, as the page receives them. */
const publishedTable = (identifications) =>
  identificationTable(normalizeNode({ identifications }).identifications)

/**
 * LIVE — https://ammitto.org/api/v1/node/entity/un/cdi040.jsonld, fetched
 * 2026-08-12. A person: two passports from one country, the second stated
 * as expired in a note, its number published with a trailing space.
 */
const UN_CDI040 = [
  {
    '@type': 'Identification',
    type: 'Passport',
    number: 'AB850901',
    issuingCountry: 'United Republic of Tanzania',
  },
  {
    '@type': 'Identification',
    type: 'Passport',
    number: 'AB187304 ',
    issuingCountry: 'United Republic of Tanzania',
    note: 'Expired 28 Nov. 2016',
  },
]

/**
 * LIVE — https://ammitto.org/api/v1/node/entity/eu/eu1034727.jsonld,
 * fetched 2026-08-12. An organization: a registration number and an ISO
 * alpha-2 issuing country.
 */
const EU_1034727 = [
  {
    '@type': 'Identification',
    type: 'Regnumber',
    number: '1117799023330',
    issuingCountry: 'RU',
  },
]

/**
 * LIVE — https://ammitto.org/api/v1/node/entity/un/qdi060.jsonld, fetched
 * 2026-08-12. Three records that state no number at all: the note is the
 * whole content, and the first carries the source document's line wrapping.
 */
const UN_QDI060 = [
  {
    '@type': 'Identification',
    type: 'Passport',
    note: 'Tunisian passport number L 191609 issued on 28 Feb. 1996, expired on 27\nFeb. 2001',
  },
  { '@type': 'Identification', type: 'NationalID', note: '04643632 issued on 18 Jun. 1999' },
  { '@type': 'Identification', type: 'NationalID', note: 'Italian Fiscal Code: DAOMMD74T11Z352Z' },
]

/**
 * LIVE — https://ammitto.org/api/v1/node/entity/eu/eu101096.jsonld, fetched
 * 2026-08-12. The EU placeholder for an unstated issuing country.
 */
const EU_101096 = [
  { '@type': 'Identification', type: 'Id', number: '3603251708570001', issuingCountry: '00' },
]

test('a person shows the passport number the producer publishes', () => {
  const { rows } = publishedTable(UN_CDI040)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].type, 'Passport')
  assert.equal(rows[0].number, 'AB850901')
  assert.equal(rows[0].issuingCountry, 'United Republic of Tanzania')
  assert.equal(rows[0].note, null)
})

test('an organization shows its registration number and issuing country', () => {
  const { rows, hasIssuingCountry } = publishedTable(EU_1034727)
  assert.deepEqual(rows, [
    {
      type: 'Regnumber',
      number: '1117799023330',
      issuingCountry: 'RU',
      note: null,
    },
  ])
  assert.equal(hasIssuingCountry, true)
})

test('a number published with the source padding is shown without it', () => {
  // "AB187304 " would otherwise be copied out of the page with its space.
  const { rows } = publishedTable(UN_CDI040)
  assert.equal(rows[1].number, 'AB187304')
})

test('a note is carried through, so a record with no number still says something', () => {
  const { rows, hasIssuingCountry } = publishedTable(UN_QDI060)
  assert.equal(rows.length, 3)
  assert.equal(rows[0].number, null)
  assert.equal(rows[0].note, 'Tunisian passport number L 191609 issued on 28 Feb. 1996, expired on 27 Feb. 2001')
  // No record states a country, so the column is not offered.
  assert.equal(hasIssuingCountry, false)
})

test('the source line wrapping inside a note is not rendered as line breaks', () => {
  // The newline falls mid-sentence at whatever width the source XML used.
  const { rows } = publishedTable(UN_QDI060)
  assert.equal(rows[0].note.includes('\n'), false)
})

test('the EU placeholder is not shown as a country', () => {
  const { rows, hasIssuingCountry } = publishedTable(EU_101096)
  assert.equal(rows[0].number, '3603251708570001')
  assert.equal(rows[0].issuingCountry, null)
  assert.equal(hasIssuingCountry, false)
})

test('one record stating a country is enough to earn the column', () => {
  const { hasIssuingCountry } = publishedTable([
    { '@type': 'Identification', type: 'Passport', number: 'A1' },
    { '@type': 'Identification', type: 'NationalID', number: 'B2', issuingCountry: 'Iran' },
  ])
  assert.equal(hasIssuingCountry, true)
})

test('a numeric number is shown rather than dropped', () => {
  // The producer types it as a string, but a number is the one value this
  // table exists to show and must not vanish on a type surprise.
  const { rows } = publishedTable([{ '@type': 'Identification', type: 'Id', number: 3603251708570001 }])
  assert.equal(rows[0].number, '3603251708570001')
})

test('a record stating nothing is dropped rather than rendered as dashes', () => {
  const { rows } = publishedTable([
    { '@type': 'Identification' },
    { '@type': 'Identification', type: '   ' },
    { '@type': 'Identification', type: 'Passport', number: 'A1' },
  ])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].number, 'A1')
})

test('an absent or malformed list is an empty table rather than a throw', () => {
  for (const input of [undefined, null, 'passport', 42, {}, [null, 'x', ['y']]]) {
    assert.deepEqual(identificationTable(input), { rows: [], hasIssuingCountry: false })
  }
})

test('the fields the producer does not publish are not read', () => {
  // `document_type`, `value` and `identification` are the names the page
  // read before this change; none exists in Ammitto::Identification, so a
  // record carrying them is still an empty record.
  const { rows } = identificationTable([
    { document_type: 'Passport', value: 'AB850901', identification: 'AB850901' },
  ])
  assert.deepEqual(rows, [])
})
