/**
 * The view models the pages render birth information from.
 *
 * These cover the shipped transformation rather than the formatter it
 * calls. A formatter test passes just as happily when a call site has been
 * reverted to reading record zero, so the assertions that matter — which
 * record answers, and whether the value survives into the object a page
 * consumes — belong here.
 *
 * Plain JavaScript against the emitted modules, for the reason spelled out
 * at the top of normalizeNode.test.js.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  entityBirthClaims,
  resolveEntityBirthFields,
  searchRowText,
  searchRowToCard,
} from '../.test-build/utils/birthAdapters.js'
import { normalizeNode } from '../.test-build/utils/normalizeNode.js'

/**
 * LIVE — https://ammitto.org/api/v1/node/entity/us/11018.jsonld, fetched
 * 2026-08-11. Two place-only records precede the one carrying the date,
 * and three content-free records follow it.
 */
const US_11018_BIRTH = [
  { circa: false, city: 'Odek, Omoro, Gulu, Uganda' },
  { circa: false, city: 'Palaro Village, Palaro Parish, Omoro County, Gulu District, Uganda' },
  { date: '1964-09-18', circa: false, year: 1964, city: 'Atyak, Uganda' },
  { circa: false },
  { circa: false },
  { circa: false },
]

test('the sanctions view model carries a date from a later record', () => {
  const { birthDate } = resolveEntityBirthFields({ birth_info: US_11018_BIRTH })
  assert.equal(birthDate, '1964-09-18')
})

test('the sanctions view model keeps country and date on separate scans', () => {
  // Record 0 states the country, record 1 the date. Resolving country from
  // the record that answered for the date would blank the badge.
  const { country, birthDate } = resolveEntityBirthFields({
    birth_info: [{ country: 'Indonesia' }, { date: '1958-08-17', country: 'Malaysia' }],
  })
  assert.equal(country, 'Indonesia')
  assert.equal(birthDate, '1958-08-17')
})

test('the sanctions view model leaves the existing country fallbacks ahead of birth', () => {
  assert.equal(
    resolveEntityBirthFields({ country: 'Syria', birth_info: [{ country: 'Iraq' }] }).country,
    'Syria',
  )
  assert.equal(
    resolveEntityBirthFields({
      addresses: [{ country: 'Lebanon' }],
      birth_info: [{ country: 'Iraq' }],
    }).country,
    'Lebanon',
  )
  assert.equal(
    resolveEntityBirthFields({ nationalities: ['Yemen'], birth_info: [{ date: '1970-01-02' }] })
      .country,
    'Yemen',
  )
  assert.equal(resolveEntityBirthFields({}).birthDate, undefined)
  assert.equal(resolveEntityBirthFields(null).country, undefined)
})

test('the sanctions view model falls back to a span when no exact value is stated', () => {
  const { birthDate } = resolveEntityBirthFields({
    birth_info: [{ city: 'Tehran' }, { year_range_from: 1959, year_range_to: 1965 }],
  })
  assert.equal(birthDate, '1959-1965')
})

test('the detail projection returns every claim, and an array when there are none', () => {
  assert.deepEqual(entityBirthClaims({ birth_info: US_11018_BIRTH }), [
    'Odek, Omoro, Gulu, Uganda',
    'Palaro Village, Palaro Parish, Omoro County, Gulu District, Uganda',
    '1964-09-18, Atyak, Uganda',
  ])
  // The page asks for .length without a null guard.
  assert.deepEqual(entityBirthClaims({ birth_info: [] }), [])
  assert.deepEqual(entityBirthClaims({}), [])
  assert.deepEqual(entityBirthClaims(null), [])
})

test('the detail projection reads what normalizeNode actually delivers', () => {
  // The producer sends camelCase and numbers; normalizeNode snake_cases at
  // the fetch boundary. Pinning the two together means a respelling on
  // either side fails here rather than rendering nothing in production.
  const normalized = normalizeNode({
    '@id': 'https://www.ammitto.org/entity/eu/spanned',
    entityType: 'person',
    birthInfo: [{ '@type': 'BirthInfo', circa: true, yearRangeFrom: 1959, yearRangeTo: 1965 }],
  })
  assert.deepEqual(entityBirthClaims(normalized), ['c. 1959-1965'])
})

test('the search card renders a span for a row the producer gave no birthYear', () => {
  const card = searchRowToCard({
    id: 'https://www.ammitto.org/entity/eu/spanned',
    ref: 'eu/spanned',
    names: ['Test Person'],
    type: 'person',
    authority: 'eu',
    birthYearFrom: '1959',
    birthYearTo: '1965',
  })
  assert.equal(card.birthDate, '1959-1965')
})

test('the search card prefers an exact birthYear when the row carries both', () => {
  const card = searchRowToCard({
    id: 'https://www.ammitto.org/entity/us/11018',
    ref: 'us/11018',
    names: ['Test Person'],
    type: 'person',
    authority: 'us',
    status: 'active',
    country: 'Uganda',
    birthYear: '1964',
    birthYearFrom: '1960',
    birthYearTo: '1970',
  })
  assert.equal(card.birthDate, '1964')
  // The rest of the card is unchanged by this work, and is asserted
  // because this adapter's whole job is field mapping: `ref` drives
  // navigation (EntityCard routes to '/entity/' + ref), `names` is the
  // card's title, and `id` is its identity. A mapping mistake in any of
  // them is silent — the card still renders, just wrongly.
  assert.equal(card.id, 'https://www.ammitto.org/entity/us/11018')
  assert.equal(card.ref, 'us/11018')
  assert.deepEqual(card.names, ['Test Person'])
  assert.equal(card.country, 'Uganda')
  assert.equal(card.source, 'us')
  assert.equal(card.status, 'active')
  assert.equal(card.entityType, 'person')
})

test('the search card leaves birthDate undefined when the row states no birth', () => {
  const card = searchRowToCard({
    id: 'https://www.ammitto.org/entity/un/org',
    ref: 'un/org',
    names: ['Some Organization'],
    type: 'organization',
  })
  assert.equal(card.birthDate, undefined)
  assert.equal(card.source, 'unknown')
  assert.equal(card.status, 'active')
})

test('the indexed text carries both span bounds as their own tokens', () => {
  // A reader searching "1959" must find a person born between 1959 and
  // 1965, who has no birthYear to match on.
  const text = searchRowText({
    id: 'https://www.ammitto.org/entity/eu/spanned',
    ref: 'eu/spanned',
    names: ['Test Person'],
    type: 'person',
    authority: 'eu',
    birthYearFrom: '1959',
    birthYearTo: '1965',
  })
  assert.ok(text.split(' ').includes('1959'), `expected a 1959 token in: ${text}`)
  assert.ok(text.split(' ').includes('1965'), `expected a 1965 token in: ${text}`)
})

test('the indexed text still carries the fields it always did', () => {
  const text = searchRowText({
    id: 'https://www.ammitto.org/entity/us/11018',
    ref: 'us/11018',
    names: ['Joseph Kony', 'Joseph Rao Kony'],
    type: 'person',
    country: 'Uganda',
    regime: 'ICC',
    authority: 'us',
    imo: '1234567',
    birthYear: '1964',
  })
  for (const token of ['Joseph', 'Kony', 'Uganda', 'ICC', 'us', '1234567', '1964']) {
    assert.ok(text.includes(token), `expected ${token} in: ${text}`)
  }
})
