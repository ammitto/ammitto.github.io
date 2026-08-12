/**
 * The entity page must keep rendering the fields the producer publishes.
 *
 * `identificationDisplay.test.js` proves the table is built correctly. It
 * cannot prove the page still RENDERS it: restoring the old markup, which
 * read `id.document_type` and `id.value || id.identification` — three names
 * that have never existed in Ammitto::Identification — leaves every
 * assertion in that file green while the page shows a dash in place of
 * every passport and national-ID number.
 *
 * Closing that by execution would mean mounting the view, which needs Vite's
 * SSR loader for its `@/` aliases and `vue` imports. That harness does not
 * exist here and these tests are deliberately dependency-free on plain Node.
 *
 * So the wiring is pinned lexically: the markup that renders the table must
 * contain the fields it renders and must not mention the phantom ones.
 * These are SUBSTRING AND PATTERN CHECKS OVER SOURCE TEXT — they verify what
 * is written, not what evaluates, and a sufficiently creative rewrite can
 * still slip past. They are a narrow contract, not a behavioural test. If an
 * application-level harness is ever added, replace this file rather than
 * keeping both.
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

const ENTITY_PAGE = 'src/views/EntityPage.vue'

/**
 * The identifications block alone, so a check for a phantom field name is
 * not confused by a legitimate use elsewhere on the page — `document_type`
 * is also an announcement field, and `.value` is how the script reads every
 * ref it owns.
 */
function identificationsMarkup() {
  const source = read(ENTITY_PAGE)
  const start = source.indexOf('<!-- Identifications -->')
  const end = source.indexOf('<!-- Addresses -->', start)
  assert.notEqual(start, -1, `${ENTITY_PAGE} must keep its <!-- Identifications --> marker`)
  assert.ok(end > start, `${ENTITY_PAGE} must keep its <!-- Addresses --> marker after it`)
  return source.slice(start, end)
}

test('the identifications table renders the published fields', () => {
  const markup = identificationsMarkup()
  const flat = flatten(markup)

  // Each field the producer publishes and this table shows.
  for (const expression of [
    'row.type',
    'row.number',
    'row.issuingCountry',
    'row.note',
  ]) {
    assert.ok(flat.includes(expression), `the identifications table must render \`${expression}\``)
  }

  // Built once, in the composable, from the adapter.
  assert.ok(
    flat.includes('identificationTable.rows'),
    'the identifications table must iterate the rows the adapter built',
  )
  assert.ok(
    flat.includes('identificationTable.hasIssuingCountry'),
    'the issuing-country column must be conditional on the adapter saying so',
  )

  // The column heading names what the cell holds. "Value" over a column of
  // numbers is what the old markup promised and never delivered.
  //
  // Matched against the RAW markup, not the flattened copy: `flatten`
  // collapses whitespace to a single space rather than removing it, so a
  // substring check for `>Number</th>` breaks on the common reformat
  // `> Number </th>` while the heading is still correct.
  assert.match(
    markup,
    /<th\b[^>]*>\s*Number\s*<\/th>/,
    'the number column must be headed "Number"',
  )
})

test('the identifications table does not read a field the producer never emits', () => {
  const markup = identificationsMarkup()

  const PHANTOM_FIELDS = [
    { name: 'document_type', pattern: /\bdocument_type\b/ },
    { name: 'value', pattern: /\.value\b/ },
    { name: 'identification', pattern: /\.identification\b/ },
    { name: 'a "Document Type" column', pattern: /Document Type/ },
    { name: 'a "Value" column', pattern: />\s*Value\s*<\/th>/ },
  ]

  for (const { name, pattern } of PHANTOM_FIELDS) {
    assert.equal(
      pattern.test(markup),
      false,
      `the identifications table reads ${name}, which Ammitto::Identification has no attribute for`,
    )
  }
})

test('useEntityData delegates the table to the adapter', () => {
  const source = read('src/composables/useEntityData.ts')

  assert.ok(
    flatten(source).includes('identificationTable(entity.value?.identifications)'),
    'useEntityData must build the table through the adapter',
  )
  // A real import declaration, not the word in a comment.
  assert.match(
    source,
    /^\s*import\s+\{[^}]*\}\s+from\s+'@\/utils\/identificationDisplay'/m,
    "useEntityData must import from '@/utils/identificationDisplay'",
  )
})

test('useSanctionsData declares no identification fields', () => {
  // Its view model has never carried identifications and its transform has
  // never read them; the interface that claimed otherwise described three
  // fields that do not exist, and drifted unnoticed because nothing
  // consumed it.
  //
  // Anchored to a property declaration rather than the bare word: a
  // substring check for 'identification' also matches a comment that
  // merely mentions the field, and the longer word 'identifications' in
  // any prose the module grows.
  assert.doesNotMatch(
    read('src/composables/useSanctionsData.ts'),
    /^[ \t]*(?:readonly[ \t]+)?identifications[ \t]*\??[ \t]*:/m,
    'useSanctionsData declares an identifications field nothing reads',
  )
})

test('the adapter is compiled for the unit tests', () => {
  // A module absent from this list emits nothing, and its test then fails
  // with "module not found" — which reads as a broken import rather than
  // the missing coverage it actually is.
  assert.ok(
    read('tsconfig.test.json').includes('identificationDisplay.ts'),
    'tsconfig.test.json must include src/utils/identificationDisplay.ts',
  )
})
