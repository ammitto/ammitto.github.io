/**
 * `useEntityData` must keep fetching entries through the pool.
 *
 * `entryFetchPool.test.js` proves the pool is bounded and ordered. It
 * cannot prove the composable still CALLS it: reverting `loadEntries` to
 * an inline `for (…) await fetchEntry(…)` leaves every pool assertion
 * green. That is exactly the gap the round-2 review of this change
 * refused to pass — a suite that goes green against something other than
 * the shipped path.
 *
 * Closing it by execution would mean running the composable, which needs
 * Vite's SSR loader to resolve its `@/` aliases, `vue` imports and
 * `import.meta.env`. That harness does not exist here and these tests are
 * deliberately dependency-free on plain Node.
 *
 * So this file pins the wiring lexically instead. These are SUBSTRING AND
 * PATTERN CHECKS OVER SOURCE TEXT — they verify the call is written, not
 * that it evaluates, and a sufficiently creative rewrite can still slip
 * past. They are a narrow contract, not a behavioural test. If an
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

const CONSUMER = 'src/composables/useEntityData.ts'

test(`${CONSUMER} loads entries through the pool`, () => {
  const source = read(CONSUMER)

  assert.ok(
    flatten(source).includes('await mapWithPool(iris, fetchEntry)'),
    `${CONSUMER} must contain \`await mapWithPool(iris, fetchEntry)\`; it owns entry loading`,
  )

  // A real import declaration, not the word in a comment.
  assert.match(
    source,
    /^\s*import\s+\{[^}]*\bmapWithPool\b[^}]*\}\s+from\s+'@\/utils\/entryFetchPool'/m,
    `${CONSUMER} must import mapWithPool from '@/utils/entryFetchPool'`,
  )
})

test(`${CONSUMER} does not run its own concurrency`, () => {
  const source = read(CONSUMER)

  // The three shapes an author undoing this change would write. Each one
  // passes the pool's own tests untouched, so each is banned outright.
  const FORBIDDEN = [
    {
      name: 'awaiting an entry fetch directly (sequential)',
      pattern: /await\s+fetchEntry\s*\(/,
    },
    {
      name: 'Promise.all over the entry list (unbounded)',
      pattern: /Promise\s*\.\s*all\s*\(/,
    },
    {
      name: 'a hand-rolled result buffer (a second copy of the pool)',
      pattern: /new\s+Array\s*\(\s*iris\s*\.\s*length\s*\)/,
    },
  ]

  for (const { name, pattern } of FORBIDDEN) {
    assert.equal(
      pattern.test(source),
      false,
      `${CONSUMER} contains ${name}; entry concurrency belongs to mapWithPool`,
    )
  }
})

test('the pool tests run the shipped module, not a copy of it', () => {
  // The defect this change exists to fix. A test file that declares its
  // own `mapWithPool` is testing itself.
  const suite = read('tests/entryFetchPool.test.js')

  assert.match(
    suite,
    /from\s+'\.\.\/\.test-build\/utils\/entryFetchPool\.js'/,
    'entryFetchPool.test.js must import the emitted module',
  )
  assert.equal(
    /(function|const|let|var)\s+mapWithPool\b/.test(suite),
    false,
    'entryFetchPool.test.js must not define its own mapWithPool',
  )
})

test('the pool is compiled for the unit tests', () => {
  // A module absent from this list emits nothing, and its test then fails
  // with "module not found" — which reads as a broken import rather than
  // the missing coverage it actually is.
  assert.ok(
    read('tsconfig.test.json').includes('src/utils/entryFetchPool.ts'),
    'tsconfig.test.json must include src/utils/entryFetchPool.ts',
  )
})
