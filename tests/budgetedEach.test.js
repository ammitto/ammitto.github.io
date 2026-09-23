/**
 * Behavioural coverage for the time-budgeted loop that builds the search index.
 *
 * The index build yields to the event loop whenever a step has run for its
 * time budget. What must never depend on the clock is WHAT gets built: every
 * row visited once, in order. What must depend on it is WHEN the loop yields.
 * Both are pinned here against a fake clock, so the tests are deterministic.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { forEachWithinBudget } from '../.test-build/utils/budgetedEach.js'

/**
 * A clock that advances `msPerVisit` for each item visited, and a log of the
 * visits and yields in the order they happened.
 */
function harness(msPerVisit) {
  let clock = 0
  const log = []
  return {
    log,
    visit: (item) => {
      log.push(item)
      clock += msPerVisit
    },
    options: (budgetMs, checkEvery) => ({
      budgetMs,
      checkEvery,
      now: () => clock,
      yieldControl: async () => {
        log.push('yield')
      },
    }),
  }
}

const range = (n) => Array.from({ length: n }, (_, i) => i)

test('visits every item exactly once, in order', async () => {
  const h = harness(1)
  await forEachWithinBudget(range(1000), h.visit, h.options(40, 25))
  assert.deepEqual(h.log.filter((x) => x !== 'yield'), range(1000))
})

test('yields once a step has used its budget, checking every group of items', async () => {
  // 1ms per item, 40ms budget, clock read every 25 items: the read after 25
  // items sees 25ms (under budget), the read after 50 sees 50ms (over), so
  // each step is 50 items and 120 items make steps of 50, 50, 20.
  const h = harness(1)
  await forEachWithinBudget(range(120), h.visit, h.options(40, 25))
  const yieldsAt = h.log
    .map((x, i) => (x === 'yield' ? i : -1))
    .filter((i) => i >= 0)
  assert.deepEqual(yieldsAt, [50, 101])
})

test('a slower item cost means fewer items per step, not a longer step', async () => {
  // The reason for a time budget over a row count: when each item costs
  // more, a step covers fewer items. At 4ms per item the first clock read
  // (25 items, 100ms) is already over budget.
  const h = harness(4)
  await forEachWithinBudget(range(100), h.visit, h.options(40, 25))
  assert.deepEqual(
    h.log,
    [
      ...range(25), 'yield',
      ...range(50).slice(25), 'yield',
      ...range(75).slice(50), 'yield',
      ...range(100).slice(75),
    ],
  )
})

test('does not yield after the last item, nor at all for an empty list', async () => {
  const fits = harness(0)
  await forEachWithinBudget(range(30), fits.visit, fits.options(40, 25))
  assert.equal(fits.log.includes('yield'), false)

  const empty = harness(1)
  await forEachWithinBudget([], empty.visit, empty.options(40, 25))
  assert.deepEqual(empty.log, [])
})

test('a clock that reads NaN or runs backwards yields after every group', async () => {
  // A budget measured with a broken clock must never mean an unbounded step.
  for (const reads of [() => Number.NaN, (n) => -n]) {
    const log = []
    let n = 0
    await forEachWithinBudget(range(60), (x) => log.push(x), {
      budgetMs: 40,
      checkEvery: 25,
      now: () => reads(n++),
      yieldControl: async () => { log.push('yield') },
    })
    assert.deepEqual(log, [...range(25), 'yield', ...range(50).slice(25), 'yield', ...range(60).slice(50)])
  }
})

test('rejects a clock-read interval that would never advance', async () => {
  for (const checkEvery of [0, -1, 2.5, Number.NaN]) {
    const h = harness(1)
    await assert.rejects(
      forEachWithinBudget(range(3), h.visit, h.options(40, checkEvery)),
      RangeError,
    )
  }
})

test('the search-index build uses the time budget, not a fixed row count', () => {
  const source = readFileSync(
    new URL('../src/composables/useSearchIndex.ts', import.meta.url),
    'utf8',
  )
  assert.match(
    source,
    /^\s*import\s+\{\s*forEachWithinBudget\s*\}\s+from\s+'@\/utils\/budgetedEach'/m,
  )
  assert.match(source, /await forEachWithinBudget\(\s*data\.entities,/)
  // A fixed-size slice is what the budget replaced; it cannot bound a step
  // because a row costs more to add as the index fills.
  assert.equal(/INDEX_CHUNK_SIZE|\.slice\(start/.test(source), false)

  // The index is published only once the whole loop has finished.
  const build = source.indexOf('await forEachWithinBudget(')
  assert.ok(build < source.indexOf('searchIndex.value = index'))
  assert.ok(build < source.indexOf('isLoaded.value = true'))
})
