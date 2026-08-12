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

test('renders a date span ahead of the year bounds derived from it', () => {
  // The gem publishes BOTH pairs on one record: `birth_info_for_date_range`
  // fills year_range_from/to from the endpoint years so a year-only index
  // keeps the person. Reading the year pair first prints "1961-1962" for a
  // span the source stated to the day, which is the precision the date
  // bounds exist to carry.
  assert.equal(
    formatBirthTemporal({
      date_range_from: '1961-01-01',
      date_range_to: '1962-12-31',
      year_range_from: 1961,
      year_range_to: 1962,
    }),
    '1961-01-01-1962-12-31',
  )
})

test('renders an open date bound as the direction it leaves open', () => {
  // The same two shapes the year span has, in the same words: the gem's
  // formatted_date_range and formatted_year_range differ only in values.
  assert.equal(formatBirthTemporal({ date_range_from: '1961-01-01' }), '1961-01-01 or later')
  assert.equal(formatBirthTemporal({ date_range_to: '1962-12-31' }), 'no later than 1962-12-31')
})

test('prefixes circa on the date span branch too', () => {
  assert.equal(
    formatBirthTemporal({
      date_range_from: '1961-01-01',
      date_range_to: '1962-12-31',
      circa: true,
    }),
    'c. 1961-01-01-1962-12-31',
  )
  assert.equal(
    formatBirthTemporal({ date_range_to: '1962-12-31', circa: true }),
    'c. no later than 1962-12-31',
  )
})

test('leaves the year span alone when no date bounds are stated', () => {
  assert.equal(formatBirthTemporal({ year_range_from: 1959, year_range_to: 1965 }), '1959-1965')
  // Blank is not a bound. A record carrying empty date keys must still
  // render its year span rather than falling into the date branch and
  // rendering nothing.
  assert.equal(
    formatBirthTemporal({
      date_range_from: '',
      date_range_to: '  ',
      year_range_from: 1959,
      year_range_to: 1965,
    }),
    '1959-1965',
  )
})

test('keeps a same-year date span at day precision on the card line', () => {
  // OFAC states spans like "28 Feb 1962 to 28 Dec 1962". The whole interval
  // lies inside one year, so the gem keeps that year as the scalar as well
  // as the bounds — the exact scan therefore stops on this record, and it
  // must still read as the span rather than as a bare "1962".
  const SAME_YEAR = [{
    circa: false,
    year: 1962,
    date_range_from: '1962-02-28',
    date_range_to: '1962-12-28',
    year_range_from: 1962,
    year_range_to: 1962,
  }]
  assert.equal(selectBirthScalar(SAME_YEAR), '1962-02-28-1962-12-28')
  assert.deepEqual(formatBirthRecords(SAME_YEAR), ['1962-02-28-1962-12-28'])
})

test('finds a span stated only as dates, without outranking an exact year', () => {
  // Derived year bounds are the producer's doing, not this module's, so the
  // span scan asks about both pairs and a record arriving with date bounds
  // alone is still found.
  assert.equal(
    selectBirthScalar([
      { city: 'Tehran' },
      { date_range_from: '1961-01-01', date_range_to: '1962-12-31' },
    ]),
    '1961-01-01-1962-12-31',
  )
  // Earliest qualifying, not most precise: an earlier record's stated year
  // still answers, as the producer's own spec pins.
  assert.equal(
    selectBirthScalar([
      { year: 1984 },
      { date_range_from: '1961-01-01', date_range_to: '1962-12-31' },
    ]),
    '1984',
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

test('reads a date span from a search row as the year bounds the index carries', () => {
  // The search index has NO date columns: `search_index_exporter.rb` builds
  // a row from birthYear, birthYearFrom and birthYearTo alone, and a date
  // span arrives there as the year bounds derived from its endpoints. That
  // derivation is what keeps such a person findable in a year-only index,
  // and it is why this path needs nothing for date spans.
  assert.equal(formatSearchBirth({ birthYearFrom: '1961', birthYearTo: '1962' }), '1961-1962')
  // A same-year date span also fills the row's birthYear, because the gem
  // retains the year the whole interval lies in.
  assert.equal(
    formatSearchBirth({ birthYear: '1962', birthYearFrom: '1962', birthYearTo: '1962' }),
    '1962',
  )
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
