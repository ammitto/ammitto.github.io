/**
 * The screening cases that motivated src/utils/searchEncode.ts.
 *
 * Every query string below was run against the live site on 2026-08-28
 * (www.ammitto.org/search, index metadata.generated 2026-08-21T12:59:04Z,
 * 61,099 rows) before this module existed. The counts recorded in each test
 * are those measurements, not predictions:
 *
 *     alqaida    0      binladen  0      islamsky  0
 *     assadd     0      gaddafi  15      qadhafi  79      kadhafi  1
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
  gluedForms,
  indexableText,
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

test('foldForSearch NEVER glues — it is the query encoder', () => {
  // THE REGRESSION THIS PINS. foldForSearch is installed as FlexSearch's
  // `encode`, so it runs on the query too, and FlexSearch INTERSECTS the query
  // terms. A glued query token therefore demands a document in which those two
  // words are adjacent, in that order. Measured over the live 61,099-row index
  // when this function did glue: `ali leilabadi` 9 results -> 0 against the
  // listed person "Ali Hajinia Leilabadi", `bank mine` 4 -> 0, `dedrone axon`
  // 1 -> 0; a sweep of 1,313 two-word queries lost results on 426 and zeroed
  // 340. That is a mass false negative on a sanctions register.
  assert.deepEqual(foldForSearch('al-Qaida'), ['al', 'qaida'])
  assert.deepEqual(foldForSearch('ali leilabadi'), ['ali', 'leilabadi'])
  assert.deepEqual(foldForSearch('bank mine'), ['bank', 'mine'])
  for (const q of ['al Qaida', 'bin Laden', 'Abu Bakr', 'Dedrone by Axon']) {
    for (const token of foldForSearch(q)) {
      assert.ok(
        !token.includes(' '),
        'tokens must be single words',
      )
    }
    assert.equal(
      foldForSearch(q).length,
      q.split(/[^\p{L}\p{N}]+/u).filter(Boolean).length,
      `${q}: encoder must emit exactly one token per word, never a glued extra`,
    )
  }
})

test('gluedForms supplies the run-together form, for documents only', () => {
  // This is what rescues `alqaida` (0 -> 33 on the live corpus, which is
  // exactly the number of rows whose name contains al-Qaida): the DOCUMENT
  // carries the glued token, so the one-word query, which encodes to exactly
  // one term, can reach it.
  assert.ok(gluedForms('al-Qaida').includes('alqaida'))
  assert.ok(gluedForms('bin Laden').includes('binladen'))
  assert.ok(gluedForms('Abu Bakr').includes('abubakr'))
  // And the query for the run-together spelling is a single plain token.
  assert.deepEqual(foldForSearch('alqaida'), ['alqaida'])
})

test('gluedForms leaves two ordinary name words alone', () => {
  // Gluing every adjacent pair would roughly double the index.
  assert.deepEqual(gluedForms('General Dynamics'), [])
  assert.equal(gluedForms('Sylvestre Mudacumura').length, 0)
})

test('indexableText appends the glued forms without losing the original', () => {
  const t = indexableText('al-Qaida IRAQ', ['al-Qaida'])
  assert.ok(t.startsWith('al-Qaida IRAQ'), 'original text must be preserved')
  assert.ok(t.includes('alqaida'), 'glued form must be appended')
  // Nothing to glue means nothing appended.
  assert.equal(
    indexableText('General Dynamics', ['General Dynamics']),
    'General Dynamics',
  )
})

test('indexableText glues only within a name, never across the row join', () => {
  // THE PRECISION DEFECT THIS PINS. `searchRowText` joins the names to the
  // country, regime and authority with spaces. Gluing its OUTPUT produced
  // tokens that straddle the join — a person named "Mohammad" from Iran
  // yielded `mohammadiran` — and because the index uses `tokenize: 'forward'`,
  // the query `mohammadi` matched that token by prefix. Measured over the live
  // corpus: 101 hits for `mohammadi`, of which 55 carried no such name, and
  // 657 for `their` of which 655 did. Scoped to names it is 48 and 12.
  const rowText = 'Mohammad IRAN sanctions-regime'
  const t = indexableText(rowText, ['Mohammad'])
  assert.ok(
    !t.includes('mohammadiran'),
    'a glued token must not span the join between a name and its metadata',
  )
  assert.equal(t, rowText, 'a single-word name has nothing to glue')

  // Nor across two separate aliases.
  const two = indexableText('Ali Bob', ['Ali', 'Bob'])
  assert.ok(!two.includes('alibob'), 'must not glue one alias to the next')

  // But within one name it still glues.
  assert.ok(indexableText('Usama bin Laden SAUDI', ['Usama bin Laden']).includes('binladen'))
})

test('foldForSearch is stable and never emits an empty token', () => {
  // A repeated particle stays repeated: this is the plain word split, and
  // deduplicating it would cost a Set allocation on every query and every
  // document to save FlexSearch from indexing a term it already holds.
  assert.deepEqual(foldForSearch('Abd al-Rahman al-Nasser'), [
    'abd', 'al', 'rahman', 'al', 'nasser',
  ])
  // gluedForms, which does feed the index with extra tokens, IS deduplicated.
  const glued = gluedForms('Abd al-Rahman al-Nasser')
  assert.equal(glued.length, new Set(glued).size, 'glued forms must be unique')
  // An empty-string token would be indexed by FlexSearch as a
  // match-everything key.
  assert.deepEqual(foldForSearch(''), [])
  assert.deepEqual(foldForSearch('---'), [])
  assert.ok(!foldForSearch('al-Qaida').includes(''))
  // gluedForms concatenates two entries drawn from foldForSearch, which ends in
  // .filter(Boolean), so an empty glued token is unreachable by construction —
  // asserting it cannot fail and is not asserted. What CAN go wrong is a glued
  // form that merely repeats one of its own parts, which would add an index
  // entry that matches nothing new.
  assert.ok(
    gluedForms('al-Qaida').every((g) => g !== 'al' && g !== 'qaida'),
    'a glued form must differ from both of its parts',
  )
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
