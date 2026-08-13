/**
 * The consumers must keep delegating entry period and remarks to the
 * adapters, and must keep rendering what the adapters return.
 *
 * `entryAdapters.test.js` proves the adapters are right. It cannot prove
 * that `useEntityData` still CALLS them, nor that `EntityPage` still
 * renders every row: reverting either to the old single-field read leaves
 * every adapter assertion green. That is the same gap `birthWiring.test.js`
 * exists to close, and the reasoning there applies here unchanged.
 *
 * These are SUBSTRING AND PATTERN CHECKS OVER SOURCE TEXT — they verify
 * the call is written, not that it evaluates, and a sufficiently creative
 * rewrite can still slip past. They are a narrow contract, not a
 * behavioural test.
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
    why: 'the entry period rows and the listings\' own remarks',
    requires: [
      'entryPeriodRows(entries.value)',
      'listingRemarks(entries.value, entity.value?.remarks)',
    ],
  },
  {
    file: 'src/views/EntityPage.vue',
    why: 'rendering every period row and both kinds of remarks',
    requires: [
      'v-for="row in periodRows"',
      '{{ row.label }}',
      '{{ row.value }}',
      'v-for="note in entryRemarks"',
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
    /^\s*import\s+\{[^}]*\}\s+from\s+'@\/utils\/entryAdapters'/m,
    "useEntityData.ts must import from '@/utils/entryAdapters'",
  )
})

/**
 * The original defect and the shapes an author undoing it would plausibly
 * write instead: a lone effective-date read, in the composable or straight
 * in the template.
 */
const SINGLE_FIELD_READS = [
  { name: 'a bare effective_date read', pattern: /period\s*(\?\.)?\.?\s*effective_date/ },
  { name: 'an effectiveDate binding', pattern: /\beffectiveDate\b/ },
]

test('no consumer falls back to reading the effective date alone', () => {
  for (const { file } of CONSUMERS) {
    const source = read(file)
    for (const { name, pattern } of SINGLE_FIELD_READS) {
      assert.equal(
        pattern.test(source),
        false,
        `${file} contains ${name}; the period goes through entryPeriodRows`,
      )
    }
  }
})

test('the entity page never renders a listed date under another name', () => {
  // The block must not carry a hand-written date row: a static
  // "Effective Date" <dt> beside the v-for is how a listed date ends up
  // labelled as something it is not.
  const flat = flatten(read('src/views/EntityPage.vue'))
  for (const label of ['Effective Date', 'Listed Date', 'Expiry Date']) {
    assert.equal(
      flat.includes(`>${label}</dt>`),
      false,
      `EntityPage.vue hard-codes a "${label}" row; labels come from the adapter`,
    )
  }
})

test('the entity page labels both kinds of remarks', () => {
  // An unlabelled paragraph leaves a reader unable to tell whether they
  // are reading about the subject or about the listing.
  const flat = flatten(read('src/views/EntityPage.vue'))
  for (const heading of ['About this entity', 'About this listing']) {
    assert.ok(flat.includes(heading), `EntityPage.vue must label remarks "${heading}"`)
  }
})

test('the entity page stops gating remarks on the entity field alone', () => {
  // Entities with listing remarks and no entity remarks must still get the
  // card, so the guard has to mention both.
  const flat = flatten(read('src/views/EntityPage.vue'))
  assert.ok(
    flat.includes('v-if="remarks || entryRemarks.length > 0"'),
    'the Remarks card must render when only the listings state remarks',
  )
})

test('the adapters are compiled for the unit tests', () => {
  // A module absent from this list emits nothing, and its test then fails
  // with "module not found" — which reads as a broken import rather than
  // the missing coverage it actually is.
  assert.ok(
    read('tsconfig.test.json').includes('entryAdapters.ts'),
    'tsconfig.test.json must include src/utils/entryAdapters.ts',
  )
})
