/**
 * The view models the entity page renders gender, role and IMO number
 * from.
 *
 * Every fixture below is a real published node, cited by IRI, because the
 * defect these cover is not that a formatter was wrong — it is that three
 * fields the API has always served were never read. An invented fixture
 * would prove the new code handles data nobody publishes.
 *
 * Plain JavaScript against the emitted modules, for the reason spelled out
 * at the top of normalizeNode.test.js.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ROLE_BOTH_LABEL,
  roleClaims,
  statedGender,
  vesselImoNumber,
} from '../.test-build/utils/entityFacts.js'
import { normalizeNode } from '../.test-build/utils/normalizeNode.js'

/**
 * LIVE — https://ammitto.org/api/v1/node/entity/un/gbi004.jsonld, fetched
 * 2026-08-13. The two role fields disagree: the UN states this person's
 * title as Colonel and their position as Major.
 */
const UN_GBI004 = {
  '@id': 'https://www.ammitto.org/entity/un/gbi004',
  '@type': 'PersonEntity',
  gender: 'Male',
  title: 'Colonel',
  position: 'Major',
}

/**
 * LIVE — https://ammitto.org/api/v1/node/entity/un/cdi048.jsonld, fetched
 * 2026-08-13. Both fields state the same rank, which is the common shape
 * wherever a person carries both.
 */
const UN_CDI048 = {
  '@id': 'https://www.ammitto.org/entity/un/cdi048',
  '@type': 'PersonEntity',
  gender: 'Male',
  title: 'Colonel',
  position: 'Colonel',
}

/**
 * LIVE — https://ammitto.org/api/v1/node/entity/us/10035.jsonld, fetched
 * 2026-08-13. Title with no position, which is what most people carrying
 * a title look like — and what the old card showed nothing for.
 */
const US_10035_TITLE = "Founder, National Congress for the People's Defense"

/**
 * LIVE — https://ammitto.org/api/v1/node/entity/eu/eu100121.jsonld,
 * fetched 2026-08-13. The EU publishes the one-letter code.
 */
const EU_EU100121 = {
  '@id': 'https://www.ammitto.org/entity/eu/eu100121',
  '@type': 'PersonEntity',
  gender: 'M',
}

/**
 * LIVE — https://ammitto.org/api/v1/node/entity/au/8227.jsonld, fetched
 * 2026-08-13. A vessel node in the producer's own vocabulary, so the
 * conversion `normalizeNode` performs is part of what is under test.
 */
const AU_8227 = {
  '@id': 'https://www.ammitto.org/entity/au/8227',
  '@type': 'VesselEntity',
  entityType: 'vessel',
  names: [{ '@type': 'Name', fullName: 'ANDAMAN SKIES', isPrimary: true }],
  imoNumber: '9288693',
  previousNames: [],
  previousFlags: [],
}

test('gender expands the code the sources publish', () => {
  assert.equal(statedGender(EU_EU100121), 'Male')
  assert.equal(statedGender({ gender: 'F' }), 'Female')
})

test('gender reads as one fact across the spellings the sources use', () => {
  // "M", "Male" and "male" are all published for the same claim. Printing
  // them as three strings would read as three different facts.
  for (const stated of ['M', 'm', 'Male', 'male', ' MALE ']) {
    assert.equal(statedGender({ gender: stated }), 'Male', `${stated} states Male`)
  }
  for (const stated of ['F', 'f', 'Female', 'female']) {
    assert.equal(statedGender({ gender: stated }), 'Female', `${stated} states Female`)
  }
})

test('gender passes an unknown value through rather than guessing', () => {
  // The producer's contract is any non-blank string. Inventing a reading
  // for a code this table does not know would be the site asserting
  // something no authority published.
  assert.equal(statedGender({ gender: 'X' }), 'X')
  assert.equal(statedGender({ gender: 'Non-binary' }), 'Non-binary')
})

test('gender is absent rather than blank when nothing is stated', () => {
  assert.equal(statedGender({}), null)
  assert.equal(statedGender({ gender: '   ' }), null)
  assert.equal(statedGender(null), null)
  assert.equal(statedGender(undefined), null)
})

test('a title with no position is shown, labelled as a title', () => {
  // The defect. This person's card was empty under a heading naming the
  // field, and this is the shape most people carrying a title have.
  assert.deepEqual(roleClaims({ title: US_10035_TITLE }), [
    { label: 'Title', value: US_10035_TITLE },
  ])
})

test('two disagreeing role fields are both shown, each labelled', () => {
  // Colonel and Major are not the same claim. Merging them, or picking
  // one, hides a difference a screening reader is entitled to see.
  assert.deepEqual(roleClaims(UN_GBI004), [
    { label: 'Position', value: 'Major' },
    { label: 'Title', value: 'Colonel' },
  ])
})

test('two role fields stating the same thing collapse to one labelled row', () => {
  assert.deepEqual(roleClaims(UN_CDI048), [{ label: ROLE_BOTH_LABEL, value: 'Colonel' }])
  assert.equal(ROLE_BOTH_LABEL, 'Position and Title')
})

test('a role field wrapped by its source still matches its twin', () => {
  // UN titles arrive broken across lines at whatever width that XML used,
  // and the same office is published into both fields with different
  // wrapping. Comparing raw would print it twice.
  const wrapped = 'Commander-in-Chief, Nduma Defence of Congo, Mayi Mayi Sheka\ngroup'
  assert.deepEqual(roleClaims({ title: wrapped, position: wrapped.replace('\n', ' ') }), [
    {
      label: ROLE_BOTH_LABEL,
      value: 'Commander-in-Chief, Nduma Defence of Congo, Mayi Mayi Sheka group',
    },
  ])
})

test('a position with no title keeps its own label', () => {
  assert.deepEqual(roleClaims({ position: 'FDLR Interim President' }), [
    { label: 'Position', value: 'FDLR Interim President' },
  ])
})

test('an entity stating no role yields no rows rather than null', () => {
  assert.deepEqual(roleClaims({}), [])
  assert.deepEqual(roleClaims({ title: '  ', position: '' }), [])
  assert.deepEqual(roleClaims(null), [])
})

test('the IMO number survives the fetch-boundary rename', () => {
  // The producer emits `imoNumber`; the site reads `imo_number`. A reader
  // of the camelCase field alone would see nothing for every vessel.
  const vessel = normalizeNode(AU_8227)
  assert.equal(vessel.imo_number, '9288693')
  assert.equal(vesselImoNumber(vessel), '9288693')
})

test('a numeric IMO number is shown rather than dropped', () => {
  // Every value published today is a string, but the producer passes the
  // model attribute through untouched.
  assert.equal(vesselImoNumber({ imo_number: 9288693 }), '9288693')
})

test('a vessel stating no IMO number yields null', () => {
  // Well under half the published vessels carry one; the row must be
  // absent for the rest rather than rendering an empty value.
  assert.equal(vesselImoNumber(normalizeNode({ '@type': 'VesselEntity' })), null)
  assert.equal(vesselImoNumber(null), null)
})
