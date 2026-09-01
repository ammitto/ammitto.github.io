/**
 * Reporting what a pooled index hydration actually managed to fetch.
 *
 * The defect this exists for: pooling the browse pages' node fetches required
 * each task to catch its own failure, and a task that catches every failure
 * turns a total outage into `[]` — which the page then rendered as "no results
 * found". A sanctions register telling a reader the dataset is empty, when the
 * truth is that nothing could be reached, is the same class of defect as a
 * false negative in search.
 *
 * The burst is what provokes it. 817 files at concurrency 12 is roughly 160
 * requests a second from one reader; while reviewing this change, enough
 * parallel requests from one machine made ammitto.org answer `429` from
 * Varnish for several minutes — and a 429 is exactly the `!response.ok` the
 * task discards.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isRetryable,
  fetchNodeOnce,
  hydrationOutcome,
} from '../.test-build/utils/indexHydration.js'

test('the transient shapes a burst provokes are retried; a 404 is not', () => {
  // 429 and 5xx mean "too fast" or "edge under load" — the burst's own doing.
  assert.equal(isRetryable(429), true)
  assert.equal(isRetryable(500), true)
  assert.equal(isRetryable(503), true)
  // A 404 means the node is not published. Retrying only doubles the burst
  // that caused the trouble.
  assert.equal(isRetryable(404), false)
  assert.equal(isRetryable(403), false)
  assert.equal(isRetryable(200), false)
})

test('a 503 succeeds on the retry', async () => {
  let calls = 0
  const doFetch = async () => {
    calls++
    return calls === 1
      ? { ok: false, status: 503 }
      : { ok: true, status: 200, json: async () => ({ id: 'ok' }) }
  }
  const got = await fetchNodeOnce('/n.jsonld', 0, async () => {}, doFetch)
  assert.deepEqual(got, { id: 'ok' })
  assert.equal(calls, 2, 'must have retried exactly once')
})

test('a 404 is not retried and yields null', async () => {
  let calls = 0
  const doFetch = async () => {
    calls++
    return { ok: false, status: 404 }
  }
  assert.equal(await fetchNodeOnce('/n.jsonld', 0, async () => {}, doFetch), null)
  assert.equal(calls, 1, 'a 404 must not be retried')
})

test('a rejecting fetch is retried once, then gives up', async () => {
  let calls = 0
  const doFetch = async () => {
    calls++
    throw new Error('network down')
  }
  assert.equal(await fetchNodeOnce('/n.jsonld', 0, async () => {}, doFetch), null)
  assert.equal(calls, 2)
})

test('a total failure is distinguishable from an empty index', () => {
  // THE POINT. Both produce an empty list; only one is an error.
  const outage = hydrationOutcome([], 817)
  assert.equal(outage.allFailed, true)
  assert.equal(outage.dropped, 817)

  const genuinelyEmpty = hydrationOutcome([], 0)
  assert.equal(
    genuinelyEmpty.allFailed,
    false,
    'an index with no entries is not an outage',
  )
})

test('a partial drop is counted rather than hidden', () => {
  const outcome = hydrationOutcome([{ a: 1 }, { a: 2 }], 4)
  assert.equal(outcome.dropped, 2)
  assert.equal(outcome.allFailed, false)
  assert.equal(outcome.requested, 4)
  assert.equal(outcome.items.length, 2)
})

test('a complete load reports nothing dropped', () => {
  const outcome = hydrationOutcome([{ a: 1 }, { a: 2 }], 2)
  assert.equal(outcome.dropped, 0)
  assert.equal(outcome.allFailed, false)
})

test('dropped never goes negative if more came back than were requested', () => {
  // Defensive: a caller passing a stale count must not produce a negative
  // that renders as "-3 of 5 loaded".
  assert.equal(hydrationOutcome([1, 2, 3], 2).dropped, 0)
})
