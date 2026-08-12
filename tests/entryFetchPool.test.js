/**
 * The bounded-concurrency pool `useEntityData.loadEntries` fetches entry
 * nodes with.
 *
 * An earlier version of this file reproduced the pool instead of importing
 * it, on the grounds that the composable needs a Vue runtime and a router.
 * That made every assertion below unfalsifiable: the shipped loop could
 * have become sequential, unbounded or unordered and all six tests would
 * still have passed. The pool now lives in `src/utils/entryFetchPool.ts`,
 * which needs neither Vue nor a router, so these run the shipped code.
 *
 * Plain JavaScript against the emitted module, for the reason spelled out
 * at the top of normalizeNode.test.js: Node 20 cannot import `.ts`
 * directly.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ENTRY_FETCH_CONCURRENCY,
  mapWithPool,
} from '../.test-build/utils/entryFetchPool.js'

const defer = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('results follow input order, not completion order', async () => {
  const iris = ['a', 'b', 'c', 'd', 'e']
  // 'a' is the slowest, so appending on arrival would put it last. It must
  // still come first: the list a reader sees is the entity's own entry order.
  const delays = { a: 40, b: 1, c: 1, d: 1, e: 1 }

  const out = await mapWithPool(iris, async (iri) => {
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

  await mapWithPool(iris, async (iri) => {
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

test('the shipped default is the limit the composable gets', async () => {
  // `loadEntries` calls `mapWithPool(iris, fetchEntry)` with no third
  // argument, so the default above is the live cap. Pinning the number
  // keeps a silent widening — to 60, or to Infinity — from passing as a
  // refactor.
  assert.equal(ENTRY_FETCH_CONCURRENCY, 6)
})

test('an explicit limit is honoured over the default', async () => {
  const iris = Array.from({ length: 20 }, (_, i) => `entry-${i}`)
  let inFlight = 0
  let peak = 0

  await mapWithPool(
    iris,
    async (iri) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await defer(1)
      inFlight -= 1
      return { id: iri }
    },
    2,
  )

  assert.equal(peak, 2, `peak concurrency was ${peak}`)
})

test('a limit below one still runs, one at a time', async () => {
  // Zero workers would return an empty array with every item unfetched —
  // silent data loss dressed up as an empty entry list.
  const iris = ['a', 'b', 'c']
  const seen = []

  const out = await mapWithPool(
    iris,
    async (iri) => {
      seen.push(iri)
      return { id: iri }
    },
    0,
  )

  assert.deepEqual(seen, iris)
  assert.deepEqual(
    out.map((entry) => entry.id),
    iris,
  )
})

test('fetches every entry exactly once', async () => {
  const iris = Array.from({ length: 37 }, (_, i) => `entry-${i}`)
  const seen = []

  const out = await mapWithPool(iris, async (iri) => {
    seen.push(iri)
    return { id: iri }
  })

  assert.equal(out.length, iris.length)
  assert.equal(new Set(seen).size, iris.length)
  assert.equal(seen.length, iris.length)
})

test('every entry is offered at its own index', async () => {
  // The index a task receives must be the index its result lands on;
  // a pool that hands out stale indices would silently reorder.
  const iris = Array.from({ length: 12 }, (_, i) => `entry-${i}`)

  const out = await mapWithPool(iris, async (iri, index) => {
    await defer(index % 3)
    return { id: iri, index }
  })

  assert.deepEqual(
    out.map((entry) => entry.index),
    iris.map((_, i) => i),
  )
})

test('a failed entry is skipped without emptying the list', async () => {
  const iris = ['ok-1', 'broken', 'ok-2']

  const out = await mapWithPool(iris, async (iri) => (iri === 'broken' ? null : { id: iri }))

  assert.deepEqual(
    out.map((entry) => entry.id),
    ['ok-1', 'ok-2'],
  )
})

test('an empty list does no work and starts no workers', async () => {
  let called = 0
  const out = await mapWithPool([], async () => {
    called += 1
    return {}
  })

  assert.deepEqual(out, [])
  assert.equal(called, 0)
})

test('fewer entries than the limit still complete', async () => {
  const out = await mapWithPool(['only'], async (iri) => ({ id: iri }))

  assert.deepEqual(
    out.map((entry) => entry.id),
    ['only'],
  )
})
