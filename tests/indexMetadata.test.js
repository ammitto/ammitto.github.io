/**
 * The search index's metadata is only stated once it has been checked.
 *
 * Every field reaches a sentence a screening analyst may file, so a bad value
 * must come back as "absent" (0 or '') and never as a figure or a date: "0
 * lists", "NaN entities" and "Data as of 1 January 1970" are all false answers.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  checkMetadata,
  countOf,
  plausibleGenerated,
  positiveCount,
} from '../.test-build/utils/indexMetadata.js'

const NOW = Date.parse('2026-09-23T12:00:00Z')

test('a well-formed block passes through unchanged', () => {
  assert.deepEqual(
    checkMetadata({ generated: '2026-09-23T08:37:05Z', totalEntities: 61348, sources: 14 }, NOW),
    { generated: '2026-09-23T08:37:05Z', totalEntities: 61348, sources: 14, invalid: [] },
  )
})

test('counts must be whole numbers above zero', () => {
  for (const bad of [undefined, null, 0, -3, 1.5, NaN, Infinity, '0', '14', 'NaN', true, {}]) {
    assert.equal(positiveCount(bad), 0, `${String(bad)} is not a count`)
  }
  assert.equal(positiveCount(1), 1)
  assert.equal(positiveCount(14), 14)
})

test('generated must be a plausible ISO instant', () => {
  for (const bad of [
    undefined,
    null,
    0,
    1,
    '0',
    '1',
    '',
    'NaN',
    '2026-09-23',
    'September 23, 2026',
    '2026-13-45T99:99:99Z',
    '1970-01-01T00:00:00Z',
    '2025-12-31T23:59:59Z',
    '2026-09-25T12:00:01Z',
    '2099-01-01T00:00:00Z',
    // Impossible calendar fields, which Date.parse would roll into a real day.
    '2026-02-31T00:00:00Z',
    '2026-02-29T00:00:00Z',
    '2026-13-01T00:00:00Z',
    '2026-04-31T00:00:00Z',
    '2026-09-23T24:00:00Z',
    '2026-09-23T12:60:00Z',
    '2026-09-23T12:00:60Z',
    '2026-09-23T12:00:00+24:00',
    '2026-09-23T12:00:00+02:60',
  ]) {
    assert.equal(plausibleGenerated(bad, NOW), '', `${String(bad)} is not a plausible date`)
  }
  for (const good of [
    '2026-02-25T23:05:22Z',
    '2026-09-23T08:37:05Z',
    '2026-09-23T08:37:05.123Z',
    '2026-09-23T10:37:05+02:00',
    // Within a day of the reader's clock: clocks drift.
    '2026-09-24T11:00:00Z',
  ]) {
    assert.equal(plausibleGenerated(good, NOW), good)
  }
})

test('every absent or invalid field is named, so it can be reported', () => {
  assert.deepEqual(checkMetadata({ generated: 1, totalEntities: '0' }, NOW), {
    generated: '',
    totalEntities: 0,
    sources: 0,
    invalid: ['generated', 'totalEntities', 'sources'],
  })
  assert.deepEqual(checkMetadata(undefined, NOW).invalid, ['generated', 'totalEntities', 'sources'])
  assert.deepEqual(checkMetadata('nonsense', NOW).invalid, ['generated', 'totalEntities', 'sources'])
})

test('a count of one takes the singular', () => {
  assert.equal(countOf(1, 'list', 'lists'), '1 list')
  assert.equal(countOf(14, 'list', 'lists'), '14 lists')
  assert.equal(countOf(1, 'sanctioned entity', 'sanctioned entities'), '1 sanctioned entity')
  assert.equal(countOf(61348, 'sanctioned entity', 'sanctioned entities'), '61,348 sanctioned entities')
})

test('a leap day is a real date, and the bounds still apply to it', () => {
  const leap = '2028-02-29T00:00:00Z'
  // Before the reader's clock (plus skew) reaches it, it is in the future.
  assert.equal(plausibleGenerated(leap, NOW), '')
  // Once it has, it is a date like any other.
  assert.equal(plausibleGenerated(leap, Date.parse('2028-03-01T00:00:00Z')), leap)
  // Within the skew allowance, not beyond it.
  assert.equal(plausibleGenerated(leap, Date.parse('2028-02-28T00:00:01Z')), leap)
  assert.equal(plausibleGenerated(leap, Date.parse('2028-02-27T23:59:59Z')), '')
})

test('an offset is applied before the bounds are checked', () => {
  // 2026-01-01T00:30+01:00 is 2025-12-31T23:30Z, before the floor.
  assert.equal(plausibleGenerated('2026-01-01T00:30:00+01:00', NOW), '')
  assert.equal(plausibleGenerated('2025-12-31T23:30:00-01:00', NOW), '2025-12-31T23:30:00-01:00')
  // The floor itself is allowed.
  assert.equal(plausibleGenerated('2026-01-01T00:00:00Z', NOW), '2026-01-01T00:00:00Z')
})

test('a long fraction is truncated to milliseconds, never rounded across the floor', () => {
  // As a float, .99999999999999999 is exactly 1, which moved this instant to
  // 2026-01-01T00:00:00Z and past the floor.
  assert.equal(plausibleGenerated(`2025-12-31T23:59:59.${'9'.repeat(17)}Z`, NOW), '')
  // The last millisecond before the floor, at every precision.
  assert.equal(plausibleGenerated('2025-12-31T23:59:59.999Z', NOW), '')
  assert.equal(plausibleGenerated('2025-12-31T23:59:59.999999Z', NOW), '')
  // The floor itself, with a fraction, is allowed.
  assert.equal(plausibleGenerated('2026-01-01T00:00:00.000Z', NOW), '2026-01-01T00:00:00.000Z')
  assert.equal(plausibleGenerated('2026-01-01T00:00:00.0001Z', NOW), '2026-01-01T00:00:00.0001Z')
})
