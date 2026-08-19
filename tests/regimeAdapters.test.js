/**
 * The regime badges the entity page renders.
 *
 * These cover the shipped transformation rather than a helper it happens
 * to call, for the reason given at the top of birthAdapters.test.js.
 *
 * Plain JavaScript against the emitted modules, for the reason spelled out
 * at the top of normalizeNode.test.js.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { regimeLabels, labelFromIri } from '../.test-build/utils/regimeAdapters.js'

/**
 * LIVE — https://www.ammitto.org/api/v1/node/regime/1533.jsonld, fetched
 * 2026-08-19. The reference shape ammitto#61 publishes.
 */
const NAMED = {
  regime: {
    '@id': 'https://www.ammitto.org/regime/1533',
    name: "1533 (Democratic People's Republic of the Congo)",
  },
}

/** The shape published before that change: identifier and nothing else. */
const UNNAMED = { regime: { '@id': 'https://www.ammitto.org/regime/al_qaida' } }

test('renders the name the producer states', () => {
  assert.deepEqual(regimeLabels([NAMED]), [
    "1533 (Democratic People's Republic of the Congo)",
  ])
})

test('falls back to the identifier when no name is published', () => {
  assert.deepEqual(regimeLabels([UNNAMED]), ['Al Qaida'])
})

test('prefers the name over what the identifier would have given', () => {
  // The whole point: these two disagree, and the name wins.
  const derived = labelFromIri(NAMED.regime['@id'])
  const [label] = regimeLabels([NAMED])

  assert.notEqual(label, derived)
  assert.equal(label, NAMED.regime.name)
})

test('treats a blank name as absent rather than rendering an empty badge', () => {
  const blank = {
    regime: { '@id': 'https://www.ammitto.org/regime/al_qaida', name: '   ' },
  }

  assert.deepEqual(regimeLabels([blank]), ['Al Qaida'])
})

test('deduplicates while keeping first-seen order', () => {
  const second = {
    regime: { '@id': 'https://www.ammitto.org/regime/russia', name: 'Russia' },
  }

  assert.deepEqual(regimeLabels([NAMED, second, NAMED]), [
    "1533 (Democratic People's Republic of the Congo)",
    'Russia',
  ])
})

test('skips an entry with no regime, and an empty list', () => {
  assert.deepEqual(regimeLabels([{}, { regime: null }, NAMED]), [
    "1533 (Democratic People's Republic of the Congo)",
  ])
  assert.deepEqual(regimeLabels([]), [])
})

test('skips a reference carrying neither a name nor an identifier', () => {
  assert.deepEqual(regimeLabels([{ regime: { code: 'RUSSIA' } }]), [])
})

test('keeps the cn_ expansion the fallback always applied', () => {
  assert.equal(
    labelFromIri('https://www.ammitto.org/regime/cn_export_control'),
    'China: Export Control',
  )
})

test('returns null for a string that is not a regime IRI', () => {
  assert.equal(labelFromIri('https://www.ammitto.org/entity/un/x'), null)
})
