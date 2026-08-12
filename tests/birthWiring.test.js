/**
 * The consumers must keep delegating birth selection to the adapters.
 *
 * `birthAdapters.test.js` proves the adapters are right. It cannot prove
 * that `useSanctionsData` still CALLS them: reverting that file to an
 * inline `birth_info[0]` read leaves every adapter assertion green. That
 * is the gap the round-2 review of this change refused to pass — a suite
 * that goes green against something other than the shipped path.
 *
 * Closing it by execution would mean running the composables, which needs
 * Vite's SSR loader to resolve their `@/` aliases, `vue` imports and
 * `import.meta.env`. That harness does not exist here and these tests are
 * deliberately dependency-free on plain Node.
 *
 * So this file pins the wiring lexically instead: each consumer must
 * contain its exact delegating expression, a real import declaration, and
 * none of the shapes a reverting author would plausibly write. These are
 * SUBSTRING AND PATTERN CHECKS OVER SOURCE TEXT — they verify the call is
 * written, not that it evaluates, and a sufficiently creative rewrite can
 * still slip past. They are a narrow contract, not a behavioural test.
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

/**
 * Ways of reaching into a birth record that must not reappear in a
 * consumer. Indexing is the original defect; the others are the
 * equivalents someone undoing this change would reasonably reach for.
 */
const DIRECT_RECORD_ACCESS = [
  { name: 'indexing', pattern: /birth_?[iI]nfo\s*(\?\.)?\[\s*\d+\s*\]/ },
  { name: '.at()', pattern: /birth_?[iI]nfo\s*\)?\s*(\?\.)?\.?\s*at\s*\(/ },
  { name: '.slice()', pattern: /birth_?[iI]nfo\s*\)?\s*(\?\.)?\.?\s*slice\s*\(/ },
  { name: '.find()', pattern: /birth_?[iI]nfo\s*\)?\s*(\?\.)?\.?\s*find\s*\(/ },
  { name: 'array destructuring', pattern: /\[[^\]]*\]\s*=\s*[^;\n]*birth_?[iI]nfo/ },
]

/**
 * Each consumer, the exact expression that must appear in it, and any
 * token it must not contain at all.
 *
 * `requires` is matched against whitespace-flattened source, so wrapping
 * or reindenting is fine and only the data flow is pinned.
 */
const CONSUMERS = [
  {
    file: 'src/composables/useSanctionsData.ts',
    why: 'country and birth date for the sanctions view model',
    requires: ['const { country, birthDate } = resolveEntityBirthFields(entity)'],
    forbidsTokens: [],
  },
  {
    file: 'src/composables/useEntityData.ts',
    why: 'every distinct claim for the entity detail page',
    requires: [
      'entityBirthClaims(entity.value)',
      'selectBirthCountry(entity.value.birth_info)',
    ],
    forbidsTokens: [],
  },
  {
    file: 'src/views/SearchPage.vue',
    why: 'the search result card, including a span-only row',
    requires: ['=> searchRowToCard(entity)'],
    // The row's birthYear is absent whenever the producer states a span,
    // so any direct read of it drops those people. Spreading the adapter
    // and then overriding the field would pass a call-name check, so the
    // token is banned outright.
    forbidsTokens: ['birthYear'],
  },
  {
    file: 'src/composables/useSearchIndex.ts',
    why: 'the indexed text, which must carry both span bounds',
    requires: ['const text = searchRowText(entity)'],
    forbidsTokens: [],
  },
]

for (const { file, why, requires, forbidsTokens } of CONSUMERS) {
  test(`${file} delegates ${why}`, () => {
    const source = read(file)
    const flat = flatten(source)

    for (const expression of requires) {
      assert.ok(
        flat.includes(flatten(expression)),
        `${file} must contain \`${expression}\` — it owns ${why}`,
      )
    }

    // A real import declaration, not the word in a comment.
    assert.match(
      source,
      /^\s*import\s+\{[^}]*\}\s+from\s+'@\/utils\/birthAdapters'/m,
      `${file} must import from '@/utils/birthAdapters'`,
    )

    for (const token of forbidsTokens) {
      assert.equal(
        source.includes(token),
        false,
        `${file} must not mention \`${token}\`; it goes through the adapter`,
      )
    }
  })
}

test('no consumer reaches into a birth record directly', () => {
  // The defect this change removes, plus the shapes an author undoing it
  // would plausibly write instead of plain indexing.
  for (const { file } of CONSUMERS) {
    const source = read(file)
    for (const { name, pattern } of DIRECT_RECORD_ACCESS) {
      assert.equal(
        pattern.test(source),
        false,
        `${file} uses ${name} on a birth record; it must go through the adapters`,
      )
    }
  }
})

test('the adapters are compiled for the unit tests', () => {
  // A module absent from this list emits nothing, and its test then fails
  // with "module not found" — which reads as a broken import rather than
  // the missing coverage it actually is.
  const config = read('tsconfig.test.json')
  for (const module of ['birthDisplay.ts', 'birthAdapters.ts']) {
    assert.ok(
      config.includes(module),
      `tsconfig.test.json must include src/utils/${module}`,
    )
  }
})
