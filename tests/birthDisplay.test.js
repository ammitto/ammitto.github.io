/**
 * Birth record selection and display.
 *
 * Two contracts are pinned here, both owned by the gem rather than by this
 * repo, so a drift on either side fails in this file instead of quietly
 * changing what a screening reader is shown:
 *
 *  - which record answers (earliest qualifying, two independent scans)
 *  - how it reads (`Ammitto::BirthInfo#formatted_date`)
 *
 * Fixtures marked LIVE are copied from published API responses, not
 * invented. Inventing them was how the shape got misread in the first
 * place.
 *
 * Plain JavaScript against the emitted module, for the reason spelled out
 * at the top of normalizeNode.test.js: Node 20 cannot import `.ts`
 * directly.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatBirthPlace,
  formatBirthRecord,
  formatBirthRecords,
  formatBirthTemporal,
  formatSearchBirth,
  selectBirthCountry,
  selectBirthScalar,
} from '../.test-build/utils/birthDisplay.js'

/**
 * LIVE — https://ammitto.org/api/v1/node/entity/us/11018.jsonld, fetched
 * 2026-08-11, snake_cased as normalizeNode delivers it. Two place-only
 * records precede the one carrying the date, and three content-free
 * records follow it. Reading index 0 renders nothing for this person.
 */
const US_11018 = [
  { circa: false, city: 'Odek, Omoro, Gulu, Uganda' },
  { circa: false, city: 'Palaro Village, Palaro Parish, Omoro County, Gulu District, Uganda' },
  { date: '1964-09-18', circa: false, year: 1964, city: 'Atyak, Uganda' },
  { circa: false },
  { circa: false },
  { circa: false },
]

test('finds a date that is not in the first record', () => {
  // The defect this change exists to fix. Against the previous
  // `birth_info[0].date` read this is undefined.
  assert.equal(selectBirthScalar(US_11018), '1964-09-18')
})

test('renders every distinct claim, dropping the content-free records', () => {
  assert.deepEqual(formatBirthRecords(US_11018), [
    'Odek, Omoro, Gulu, Uganda',
    'Palaro Village, Palaro Parish, Omoro County, Gulu District, Uganda',
    '1964-09-18, Atyak, Uganda',
  ])
})

test('takes the country from the first record stating one, not from the dated record', () => {
  // Reading the country off whichever record supplied the date would lose
  // the badge this entity shows today.
  assert.equal(selectBirthCountry(US_11018), null)
  assert.equal(
    selectBirthCountry([{ city: 'Damascus' }, { date: '1973-04-03', country: 'Syria' }]),
    'Syria',
  )
  assert.equal(
    selectBirthCountry([{ country: 'Indonesia' }, { date: '1958-08-17', country: 'Malaysia' }]),
    'Indonesia',
  )
})

test('prefers the earliest record that states a value, not the most precise', () => {
  // Mirrors the producer's own spec example, 'still prefers the earliest
  // record that states one' (search_index_exporter_spec.rb). Ranking an
  // exact date above an earlier stated year would contradict it.
  assert.equal(selectBirthScalar([{ year: 1984 }, { date: '1990-01-08' }]), '1984')
})

test('falls back to a span only when no record states an exact value', () => {
  assert.equal(
    selectBirthScalar([{ city: 'Tehran' }, { year_range_from: 1959, year_range_to: 1965 }]),
    '1959-1965',
  )
  // The exact scan and the span scan are independent, and the exact one
  // answers when both find something.
  assert.equal(
    selectBirthScalar([{ year_range_from: 1953, year_range_to: 1958 }, { date: '1958-08-17' }]),
    '1958-08-17',
  )
})

test('keeps a span whole rather than assembling one from two records', () => {
  // Both bounds come from the record that answered. Pairing 1953 with
  // 1965 here would state a span neither source claimed.
  assert.equal(
    selectBirthScalar([{ year_range_from: 1953 }, { year_range_to: 1965 }]),
    '1953 or later',
  )
})

test('renders an open bound as the direction it leaves open', () => {
  // The producer states either bound alone, so both open shapes are
  // reachable. `${from}-${to}` would print "-1980", a negative year.
  assert.equal(formatBirthTemporal({ year_range_to: 1980 }), 'no later than 1980')
  assert.equal(formatBirthTemporal({ year_range_from: 1953 }), '1953 or later')
  assert.equal(formatBirthTemporal({ year_range_from: 1959, year_range_to: 1965 }), '1959-1965')
})

test('prefixes circa on every temporal branch, not on years alone', () => {
  assert.equal(formatBirthTemporal({ date: '1973-04-03', circa: true }), 'c. 1973-04-03')
  assert.equal(formatBirthTemporal({ year: 1960, circa: true }), 'c. 1960')
  assert.equal(
    formatBirthTemporal({ year_range_from: 1953, year_range_to: 1958, circa: true }),
    'c. 1953-1958',
  )
  assert.equal(formatBirthTemporal({ date: '1973-04-03', circa: false }), '1973-04-03')
})

test('prefers the span, then a year without a date, then the date', () => {
  // The gem's order in formatted_date. A dated record also carries its own
  // year — the transformer fills it from the parsed date — so `year` is
  // read only when there is no date, never as an alternative to one.
  assert.equal(formatBirthTemporal({ date: '1964-09-18', year: 1964 }), '1964-09-18')
  assert.equal(formatBirthTemporal({ year: 1964 }), '1964')
  assert.equal(
    formatBirthTemporal({ date: '1964-09-18', year: 1964, year_range_from: 1960, year_range_to: 1970 }),
    '1960-1970',
  )
})

test('reads a value whether the producer sent a number or a string', () => {
  // Entity nodes carry numbers; the older published snapshot carries
  // strings. A formatter that assumed either would be wrong half the time
  // with the typecheck still green.
  assert.equal(formatBirthTemporal({ year: 1958 }), '1958')
  assert.equal(formatBirthTemporal({ year: '1958' }), '1958')
  assert.equal(formatBirthTemporal({ year_range_from: '1959', year_range_to: 1965 }), '1959-1965')
})

test('trims a value and drops one that is only whitespace', () => {
  // Live data carries both: trailing spaces on a country, and a leading
  // space on a city. Invisible in the rendered HTML, but they change the
  // key the claim list deduplicates on.
  assert.equal(formatBirthPlace({ country: 'Sudan ' }), 'Sudan')
  assert.equal(formatBirthPlace({ country: 'Russian Federation  ' }), 'Russian Federation')
  assert.equal(formatBirthPlace({ city: ' ', country: 'Yemen' }), 'Yemen')
  assert.equal(formatBirthTemporal({ year: ' ' }), null)
})

test('joins place as city, region, country', () => {
  // LIVE shape — city and region are published and were never rendered.
  assert.equal(
    formatBirthPlace({ city: 'Bern', region: 'BE', country: 'Switzerland' }),
    'Bern, BE, Switzerland',
  )
  assert.equal(formatBirthPlace({ city: 'Damascus' }), 'Damascus')
  assert.equal(formatBirthPlace({ circa: false }), null)
})

test('yields nothing for a record that states neither a time nor a place', () => {
  // The producer emits {"@type":"BirthInfo","circa":false} for a source
  // row it could not read, so a non-empty array is not proof of content.
  assert.equal(formatBirthRecord({ circa: false }), null)
  assert.equal(formatBirthRecord({}), null)
  assert.deepEqual(formatBirthRecords([{ circa: false }, { circa: false }]), [])
})

test('collapses claims that read identically, including across types', () => {
  assert.deepEqual(formatBirthRecords([{ year: 1964 }, { year: '1964' }]), ['1964'])
})

test('keeps claims that differ in place or in circa apart', () => {
  // Both differences reach the reader, so neither is a duplicate.
  assert.deepEqual(
    formatBirthRecords([
      { date: '1958-08-17', city: 'Jakarta' },
      { date: '1958-08-17', city: 'Surabaya' },
    ]),
    ['1958-08-17, Jakarta', '1958-08-17, Surabaya'],
  )
  assert.deepEqual(
    formatBirthRecords([{ year: 1960 }, { year: 1960, circa: true }]),
    ['1960', 'c. 1960'],
  )
})

test('preserves the order the sources stated, and shows conflicting dates', () => {
  // LIVE shape — entity/eu/eu101096 carries a place-only record and two
  // different stated dates. Conflicts like this are not rare; the PR
  // records the measured population.
  assert.deepEqual(
    formatBirthRecords([
      { country: 'Indonesia' },
      { date: '1958-08-17' },
      { date: '1957-08-17' },
    ]),
    ['Indonesia', '1958-08-17', '1957-08-17'],
  )
})

test('handles an absent, empty or malformed list rather than throwing', () => {
  assert.deepEqual(formatBirthRecords(undefined), [])
  assert.deepEqual(formatBirthRecords([]), [])
  assert.deepEqual(formatBirthRecords(null), [])
  assert.equal(selectBirthScalar(undefined), null)
  assert.equal(selectBirthScalar([]), null)
  assert.equal(selectBirthCountry(undefined), null)
  assert.equal(formatBirthRecord(null), null)
  assert.equal(formatBirthTemporal(undefined), null)
})

test('reads the search row, which is flat and carries no list', () => {
  assert.equal(formatSearchBirth({ birthYear: '1964' }), '1964')
})

test('gives a search row its span when the producer left birthYear out', () => {
  // A span-only person has NO birthYear: the producer excludes the span
  // keys from the lookup that fills it. Without this the card shows no
  // birth information and the row is unfindable by year.
  assert.equal(formatSearchBirth({ birthYearFrom: '1959', birthYearTo: '1965' }), '1959-1965')
  assert.equal(formatSearchBirth({ birthYearTo: '1980' }), 'no later than 1980')
  assert.equal(formatSearchBirth({ birthYearFrom: '1953' }), '1953 or later')
  assert.equal(formatSearchBirth({}), null)
  assert.equal(formatSearchBirth(undefined), null)
})
