/**
 * The composable must keep delegating regime labels to the adapter, and
 * must not go back to reconstructing them from the identifier inline.
 *
 * `regimeAdapters.test.js` proves the adapter prefers the published name.
 * It cannot prove that `useEntityData` still CALLS it: restoring the old
 * inline derivation leaves every adapter assertion green while the page
 * shows `Al Qaida` again. That is the same gap `entryWiring.test.js`
 * exists to close, and the reasoning there applies here unchanged.
 *
 * These are SUBSTRING AND PATTERN CHECKS OVER SOURCE TEXT — they verify
 * the call is written, not that it evaluates, and a sufficiently creative
 * rewrite can still slip past. They are a narrow contract, not a
 * behavioural test.
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
 * Comments are stripped before the inline-derivation check below, or the
 * note explaining WHY the derivation moved out would itself fail it.
 */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const COMPOSABLE = 'src/composables/useEntityData.ts'

test('useEntityData delegates the regime badges to the adapter', () => {
  assert.ok(
    flatten(read(COMPOSABLE)).includes(flatten('regimeLabels(entries.value)')),
    `${COMPOSABLE} must contain \`regimeLabels(entries.value)\``,
  )
})

test('useEntityData imports the adapter for real', () => {
  // A real import declaration, not the word in a comment.
  assert.match(
    read(COMPOSABLE),
    /^\s*import\s+\{[^}]*\bregimeLabels\b[^}]*\}\s+from\s+'@\/utils\/regimeAdapters'/m,
    `${COMPOSABLE} must import regimeLabels from '@/utils/regimeAdapters'`,
  )
})

/**
 * The defect, and the shape an author undoing it would plausibly write:
 * pulling the tail off the regime IRI in the composable and title-casing
 * it. The adapter keeps that fallback; the composable must not.
 */
test('the composable does not rebuild a label from the identifier', () => {
  const source = stripComments(read(COMPOSABLE))

  // The regex alone catches a verbatim revert — checked against the real
  // prior source — and the quoted variants close the gap where an author
  // rewrites the literal while keeping the derivation.
  assert.equal(
    /\/regime\\?\/\(\.\+\)\$\//.test(source) ||
      source.includes("'China: '") ||
      source.includes('"China: "'),
    false,
    `${COMPOSABLE} reconstructs a regime label; that belongs in regimeAdapters`,
  )
})

test('the adapter still carries the fallback for older records', () => {
  // Records harmonized before ammitto#61 have no name to prefer, so
  // deleting the fallback would blank their badges rather than improve
  // them.
  assert.ok(
    read('src/utils/regimeAdapters.ts').includes("'China: '"),
    'regimeAdapters must keep the identifier fallback',
  )
})
