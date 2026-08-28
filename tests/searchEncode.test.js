/**
 * The screening cases that motivated src/utils/searchEncode.ts.
 *
 * Every query string below was run against the live site on 2026-08-28
 * (www.ammitto.org/search, index metadata.generated 2026-08-21T12:59:04Z,
 * 61,099 rows) before this module existed. The counts recorded in each test
 * are those measurements, not predictions:
 *
 *     al qaida  372      alqaida   0
 *     assad      67      assadd    0
 *     gaddafi    15      qadhafi  79      kadhafi  1
 *
 * The zeroes are what these tests exist to prevent regressing. A sanctions
 * register that answers a misspelling with "No entities match your current
 * search criteria" is stating a finding it has not made.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  foldToken,
  foldForSearch,
  boundedEditDistance,
  suggestionBudget,
  nearestNames,
} from '../.test-build/utils/searchEncode.js'

test('foldToken strips diacritics the corpus carries and the analyst omits', () => {
  // "Islámský stát" is how the corpus spells Islamic State in Czech-sourced
  // aliases; "islamsky" returned 0 on the live site.
  assert.equal(foldToken('Islámský'), 'islamsky')
  assert.equal(foldToken('Muḥammad'), 'muhammad')
  assert.equal(foldToken('Ṭāhir'), 'tahir')
  assert.equal(foldToken('BASHAR'), 'bashar')
  // Already-folded input is unchanged, so folding twice is safe.
  assert.equal(foldToken(foldToken('Ṭāhir')), 'tahir')
})

test('foldForSearch splits on punctuation, not just whitespace', () => {
  // The three spellings the corpus and analysts use interchangeably must reach
  // the same pair of tokens.
  const hyphen = foldForSearch('al-Qaida')
  const space = foldForSearch('al Qaida')
  const apostrophe = foldForSearch("al'Qaida")

  for (const tokens of [hyphen, space, apostrophe]) {
    assert.ok(tokens.includes('al'), 'expected token "al"')
    assert.ok(tokens.includes('qaida'), 'expected token "qaida"')
  }
})

test('foldForSearch glues short particles so a run-together query still matches', () => {
  // This is the fix for `alqaida` -> 0 results. The document emits the glued
  // form, so the one-word query reaches it.
  assert.ok(foldForSearch('al-Qaida').includes('alqaida'))
  assert.ok(foldForSearch('bin Laden').includes('binladen'))
  assert.ok(foldForSearch('Abu Bakr').includes('abubakr'))

  // And the query folds to the same token, which is what makes them meet.
  assert.deepEqual(foldForSearch('alqaida'), ['alqaida'])
})

test('foldForSearch does not glue two ordinary name words', () => {
  // Gluing every adjacent pair would roughly double the index. Only pairs with
  // a short particle are glued.
  const tokens = foldForSearch('General Dynamics')
  assert.ok(tokens.includes('general'))
  assert.ok(tokens.includes('dynamics'))
  assert.ok(
    !tokens.includes('generaldynamics'),
    'two long words must not be glued',
  )
})

test('foldForSearch is stable and duplicate-free', () => {
  // A repeated particle must not inflate the index.
  const tokens = foldForSearch('Abd al-Rahman al-Nasser')
  assert.equal(
    tokens.length,
    new Set(tokens).size,
    'encoder emitted duplicate tokens',
  )
  // Empty and punctuation-only input must not produce empty-string tokens,
  // which FlexSearch would happily index as a match-everything key.
  assert.deepEqual(foldForSearch(''), [])
  assert.deepEqual(foldForSearch('---'), [])
  assert.ok(!foldForSearch('al-Qaida').includes(''))
})

test('boundedEditDistance abandons rather than reporting a distance past the bound', () => {
  assert.equal(boundedEditDistance('qadhafi', 'qadhafi', 2), 0)
  assert.equal(boundedEditDistance('kadhafi', 'qadhafi', 2), 1)
  assert.equal(boundedEditDistance('assadd', 'assad', 2), 1)
  // Past the bound the answer is null, not a number, so a caller cannot rank
  // on a distance that was never computed.
  assert.equal(boundedEditDistance('mudacumura', 'assad', 2), null)
  // The length shortcut must not produce a false null inside the bound.
  assert.equal(boundedEditDistance('assad', 'assadxy', 2), 2)
})

test('suggestionBudget forgives less on short queries', () => {
  // Two edits on a three-letter token would suggest most of the corpus.
  assert.equal(suggestionBudget('abc'), 0)
  assert.equal(suggestionBudget('assad'), 1)
  assert.equal(suggestionBudget('mudacumura'), 2)
})

test('nearestNames rescues the transliteration no encoder can fold', () => {
  // The case that motivated the module: on the live site `kadhafi` returned 1
  // result and `gaddafi` 15, while `qadhafi` returned 79. Folding cannot fix a
  // substituted first letter, so the empty state has to offer the alternative.
  const corpus = ['qadhafi', 'gaddafi', 'assad', 'mudacumura', 'qaida']

  const near = nearestNames('kadhafi', corpus)
  const tokens = near.map((n) => n.token)
  assert.ok(tokens.includes('qadhafi'), 'expected qadhafi to be suggested')
  assert.ok(tokens.includes('gaddafi'), 'expected gaddafi to be suggested')

  // A one-character typo finds the real name.
  assert.ok(nearestNames('assadd', corpus).map((n) => n.token).includes('assad'))
})

test('nearestNames never suggests the query back to the user', () => {
  // An exact hit is not a near miss; if it were in the index the query would
  // not have been empty in the first place.
  const near = nearestNames('assad', ['assad', 'assam'])
  assert.ok(!near.map((n) => n.token).includes('assad'))
})

test('nearestNames orders stably: closest first, then alphabetical', () => {
  // A suggestion list that reshuffles between visits reads as unreliable.
  const corpus = ['qadhafi', 'gaddafi', 'kadhafj']
  const a = nearestNames('kadhafi', corpus).map((n) => n.token)
  const b = nearestNames('kadhafi', corpus).map((n) => n.token)
  assert.deepEqual(a, b)

  const distances = nearestNames('kadhafi', corpus).map((n) => n.distance)
  assert.deepEqual(
    distances,
    [...distances].sort((x, y) => x - y),
    'suggestions must be sorted by distance',
  )
})

test('nearestNames respects its limit', () => {
  const corpus = ['assadx', 'assady', 'assadz', 'assadw', 'assadv', 'assadu']
  assert.equal(nearestNames('assad', corpus, 3).length, 3)
})
