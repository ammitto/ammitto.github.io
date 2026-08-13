/**
 * The consumers must keep resolving and rendering the legal basis.
 *
 * `legalBasisAdapters.test.js` proves the adapters are right. It cannot
 * prove that `useEntityData` still CALLS them, nor that `EntityPage` still
 * renders what they return — and the failure mode this whole change fixes
 * is precisely a field that is published and never read, which no adapter
 * assertion would notice coming back. Deleting the call site leaves every
 * one of them green.
 *
 * These are SUBSTRING AND PATTERN CHECKS OVER SOURCE TEXT — they verify
 * the call is written, not that it evaluates, and a sufficiently creative
 * rewrite can still slip past. They are a narrow contract, not a
 * behavioural test. The reasoning is birthWiring.test.js's, unchanged.
 *
 * If an application-level harness is ever added, replace this file rather
 * than keeping both.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => readFileSync(join(repoRoot, relative), 'utf8')

/** Collapse whitespace so a reformat does not fail the contract. */
const flatten = (source) => source.replace(/\s+/g, ' ')

const CONSUMERS = [
  {
    file: 'src/composables/useEntityData.ts',
    why: 'resolving each cited instrument and exposing the rows',
    requires: [
      'await loadLegalBases()',
      'legalBasisIris(entries.value)',
      'legalBasisRows(legalBasisIris(entries.value), legalBasisNodes.value)',
      'legalInstrumentNodeUrl(iri)',
    ],
  },
  {
    file: 'src/views/EntityPage.vue',
    why: 'rendering every basis, linked only where a route was resolved',
    requires: [
      'v-for="basis in legalBases"',
      'v-if="basis.route"',
      ':to="basis.route"',
      '{{ basis.label }}',
    ],
  },
]

for (const { file, why, requires } of CONSUMERS) {
  test(`${file} delegates ${why}`, () => {
    const flat = flatten(read(file))
    for (const expression of requires) {
      assert.ok(
        flat.includes(flatten(expression)),
        `${file} must contain \`${expression}\` — it owns ${why}`,
      )
    }
  })
}

test('useEntityData imports the adapters for real', () => {
  // A real import declaration, not the word in a comment.
  assert.match(
    read('src/composables/useEntityData.ts'),
    /^\s*import\s+\{[^}]*\}\s+from\s+'@\/utils\/legalBasisAdapters'/m,
    "useEntityData.ts must import from '@/utils/legalBasisAdapters'",
  )
})

test('the sanctions block opens for an entity whose only extra fact is its legal basis', () => {
  // eu and au are the sources that publish legalBases, and an entry of
  // theirs can state nothing else this card shows. Leaving legalBases out
  // of the guard would resolve the instrument and then render no card.
  const flat = flatten(read('src/views/EntityPage.vue'))
  assert.ok(
    flat.includes('|| legalBases.length > 0" class="glass-card p-8"'),
    'the Sanctions Information card must render when only the legal basis is known',
  )
})

test('the page labels the row for what it is', () => {
  // An unlabelled instrument name beside the regimes reads as another
  // regime. The row says which of the two it is.
  assert.ok(
    flatten(read('src/views/EntityPage.vue')).includes('>Legal Basis</dt>'),
    'EntityPage.vue must label the row "Legal Basis"',
  )
})

test('no consumer resolves names by walking the instrument index', () => {
  // The index carries `@id` and nothing else, so reading it would add a
  // six-figure download per page and still name no instrument. Fetching
  // it and then every node behind it is the shape the organization and
  // document-type pages were rewritten to escape.
  for (const { file } of CONSUMERS) {
    assert.equal(
      read(file).includes('legal-instrument/index'),
      false,
      `${file} reads the instrument index; a basis resolves from its own node`,
    )
  }
})

test('the adapters are compiled for the unit tests', () => {
  // A module absent from this list emits nothing, and its test then fails
  // with "module not found" — which reads as a broken import rather than
  // the missing coverage it actually is.
  assert.ok(
    read('tsconfig.test.json').includes('legalBasisAdapters.ts'),
    'tsconfig.test.json must include src/utils/legalBasisAdapters.ts',
  )
})
