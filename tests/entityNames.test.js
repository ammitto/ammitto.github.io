/**
 * The record-heading selection, and the defect that made it say "Unknown".
 *
 * `uk/bel0174` publishes:
 *
 *     names[0] = { script: "Latn", isPrimary: true }        // no name at all
 *     names[1] = { fullName: "KAZAKOV", firstName: "Pavel", isPrimary: true }
 *
 * Every previous copy of this selection tested `is_primary` and then read
 * `full_name` off whatever it found. The find matched names[0], `full_name`
 * was undefined, and the fallback `names[0]` was that same object — so both
 * misses landed on "Unknown" with a good name one position later.
 *
 * There were four copies of that logic. Fixing one left the entity page
 * rendering its own inlined version, which is why this lives in a module.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { primaryNameOf, aliasesOf } from '../.test-build/utils/entityNames.js'

/** The real uk/bel0174 shape, normalised. */
const BEL0174 = [
  { is_primary: true },
  { full_name: 'KAZAKOV', is_primary: true },
]

test('a primary variant with no name does not win the heading', () => {
  assert.equal(primaryNameOf(BEL0174), 'KAZAKOV')
})

test('a primary variant that HAS a name still wins over a later one', () => {
  assert.equal(
    primaryNameOf([
      { full_name: 'Later', is_primary: false },
      { full_name: 'Chosen', is_primary: true },
    ]),
    'Chosen',
  )
})

test('with nothing flagged primary, the first named variant heads the record', () => {
  // 36% of sampled UK entities flag no variant primary at all.
  assert.equal(
    primaryNameOf([{ is_primary: false }, { full_name: 'First', is_primary: false }]),
    'First',
  )
})

test('null, not "Unknown", when there is no name anywhere', () => {
  // The caller picks the placeholder: AnnouncementPage derives one from the
  // entry id, which beats the word "Unknown" and would be lost if this baked
  // one in.
  assert.equal(primaryNameOf([]), null)
  assert.equal(primaryNameOf(undefined), null)
  assert.equal(primaryNameOf([{ is_primary: true }]), null)
})

test('the heading is not repeated as its own alias', () => {
  // The old filter excluded everything flagged is_primary. Where nothing is
  // flagged, the heading fell through it and appeared twice.
  assert.deepEqual(
    aliasesOf([{ full_name: 'First' }, { full_name: 'Second' }]),
    ['Second'],
  )
})

test('aliases drop duplicates and nameless variants, keeping source order', () => {
  assert.deepEqual(
    aliasesOf([
      { full_name: 'Head', is_primary: true },
      { full_name: 'Bravo' },
      { is_primary: false },
      { full_name: 'Bravo' },
      { full_name: 'Alpha' },
    ]),
    ['Bravo', 'Alpha'],
  )
})

test('uk/bel0174 yields no alias, because its only name is the heading', () => {
  assert.deepEqual(aliasesOf(BEL0174), [])
})

test('a record with no names has no aliases', () => {
  assert.deepEqual(aliasesOf([]), [])
  assert.deepEqual(aliasesOf(undefined), [])
})
