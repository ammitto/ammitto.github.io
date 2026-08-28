/**
 * `sourceCodeFromRef` — the fallback that stops an entity record rendering an
 * unnamed authority.
 *
 * The defect it exists for, measured live on 2026-08-28: every published node
 * carries an EMPTY `sourceReferences` array — checked against both
 * `api/v1/node/entity/cn/1-general-dynamics.jsonld` and
 * `api/v1/node/entity/uk/aqd0087.jsonld` — and `useEntityData` derived the
 * source from that array alone. So `source` resolved to null on every record,
 * and the entity page rendered an empty grey badge between "Organization" and
 * "active". The page Google sends people to never said who listed the entity.
 *
 * The source was in the URL the whole time: /entity/cn/1-general-dynamics.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  sourceCodeFromRef,
  extractRef,
  getEntityUrl,
  getEntityApiUrl,
} from '../.test-build/utils/entityUrls.js'

test('sourceCodeFromRef reads the source out of a bare ref', () => {
  assert.equal(sourceCodeFromRef('cn/1-general-dynamics'), 'cn')
  assert.equal(sourceCodeFromRef('uk/aqd0087'), 'uk')
})

test('sourceCodeFromRef reads the source out of a full IRI', () => {
  // This is the form the search index and the node graph actually carry.
  assert.equal(
    sourceCodeFromRef('https://www.ammitto.org/entity/cn/1-general-dynamics'),
    'cn',
  )
  assert.equal(
    sourceCodeFromRef('https://www.ammitto.org/entity/uk/aqd0087'),
    'uk',
  )
})

test('sourceCodeFromRef handles the underscored vessel codes', () => {
  // un_vessels and eu_vessels are real published codes; a stricter pattern
  // would drop them and put the empty badge back for those records.
  assert.equal(sourceCodeFromRef('un_vessels/KPi.066'), 'un_vessels')
  assert.equal(sourceCodeFromRef('eu_vessels/12345'), 'eu_vessels')
})

test('sourceCodeFromRef keeps ids containing further slashes intact', () => {
  // Only the first segment is the source; the rest is the id, whatever it holds.
  assert.equal(sourceCodeFromRef('un/KPi.066/extra'), 'un')
})

test('sourceCodeFromRef returns null rather than guessing', () => {
  // A missing badge is recoverable; a wrong authority on a sanctions record is
  // not. Anything that is not clearly a source segment yields null.
  assert.equal(sourceCodeFromRef('no-slash-at-all'), null)
  assert.equal(sourceCodeFromRef(''), null)
  assert.equal(sourceCodeFromRef('/leading-slash-only'), null)
  // Uppercase and punctuation are not source codes.
  assert.equal(sourceCodeFromRef('UK/aqd0087'), null)
  assert.equal(sourceCodeFromRef('un-vessels!/x'), null)
})

test('sourceCodeFromRef agrees with the other helpers on the same ref', () => {
  // These four functions all encode the one IRI layout; if they ever disagree
  // about where the source segment is, that layout has drifted.
  const ref = 'uk/aqd0087'
  assert.equal(extractRef(`https://www.ammitto.org/entity/${ref}`), ref)
  assert.equal(getEntityUrl(ref), '/entity/uk/aqd0087')
  assert.equal(getEntityApiUrl(ref), '/api/v1/node/entity/uk/aqd0087.jsonld')
  assert.ok(getEntityUrl(ref).startsWith(`/entity/${sourceCodeFromRef(ref)}/`))
})
