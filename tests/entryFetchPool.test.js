import { test } from 'node:test'
import assert from 'node:assert/strict'

/**
 * The bounded-concurrency pool from `useEntityData.loadEntries`.
 *
 * The composable itself needs a Vue runtime and a router, so the pool is
 * reproduced here exactly as written there and exercised directly. That is a
 * copy, and a copy can drift — so `poolFetch` below must stay identical to the
 * loop in `src/composables/useEntityData.ts`. What these tests pin is the
 * behaviour that is easy to lose when someone "simplifies" that loop into a
 * bare `Promise.all(iris.map(...))`: bounded parallelism, and output order
 * that follows the input rather than the network.
 */
const ENTRY_FETCH_CONCURRENCY = 6

async function poolFetch(iris, fetchOne, concurrency = ENTRY_FETCH_CONCURRENCY) {
  const results = new Array(iris.length).fill(null)
  let cursor = 0

  const worker = async () => {
    while (cursor < iris.length) {
      const index = cursor
      cursor += 1
      results[index] = await fetchOne(iris[index])
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, iris.length) }, worker))
  return results.filter((entry) => entry !== null)
}

const defer = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('results follow input order, not completion order', async () => {
  const iris = ['a', 'b', 'c', 'd', 'e']
  // 'a' is the slowest, so appending on arrival would put it last. It must
  // still come first: the list a reader sees is the entity's own entry order.
  const delays = { a: 40, b: 1, c: 1, d: 1, e: 1 }

  const out = await poolFetch(iris, async (iri) => {
    await defer(delays[iri])
    return { id: iri }
  })

  assert.deepEqual(
    out.map((entry) => entry.id),
    iris,
  )
})

test('never exceeds the concurrency limit', async () => {
  const iris = Array.from({ length: 50 }, (_, i) => `entry-${i}`)
  let inFlight = 0
  let peak = 0

  await poolFetch(iris, async (iri) => {
    inFlight += 1
    peak = Math.max(peak, inFlight)
    await defer(1)
    inFlight -= 1
    return { id: iri }
  })

  assert.ok(peak <= ENTRY_FETCH_CONCURRENCY, `peak concurrency was ${peak}`)
  // ...and it genuinely runs in parallel. A serial implementation passes the
  // assertion above with peak 1, which is the regression this guards.
  assert.ok(peak > 1, `pool ran serially, peak was ${peak}`)
})

test('fetches every entry exactly once', async () => {
  const iris = Array.from({ length: 37 }, (_, i) => `entry-${i}`)
  const seen = []

  const out = await poolFetch(iris, async (iri) => {
    seen.push(iri)
    return { id: iri }
  })

  assert.equal(out.length, iris.length)
  assert.equal(new Set(seen).size, iris.length)
  assert.equal(seen.length, iris.length)
})

test('a failed entry is skipped without emptying the list', async () => {
  const iris = ['ok-1', 'broken', 'ok-2']

  const out = await poolFetch(iris, async (iri) => (iri === 'broken' ? null : { id: iri }))

  assert.deepEqual(
    out.map((entry) => entry.id),
    ['ok-1', 'ok-2'],
  )
})

test('an empty list does no work and starts no workers', async () => {
  let called = 0
  const out = await poolFetch([], async () => {
    called += 1
    return {}
  })

  assert.deepEqual(out, [])
  assert.equal(called, 0)
})

test('fewer entries than the limit still complete', async () => {
  const out = await poolFetch(['only'], async (iri) => ({ id: iri }))

  assert.deepEqual(
    out.map((entry) => entry.id),
    ['only'],
  )
})
