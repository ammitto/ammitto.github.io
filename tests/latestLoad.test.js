/**
 * Behavioural coverage for route-load invalidation.
 *
 * Detail pages are reused when only `:id` changes. An older network request
 * can therefore finish after the newer route has started; its state must no
 * longer be publishable.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createLatestLoadGuard } from '../.test-build/utils/latestLoad.js'

test('only the most recently started load remains current', () => {
  const guard = createLatestLoadGuard()
  const firstIsCurrent = guard.begin()

  assert.equal(firstIsCurrent(), true)

  const secondIsCurrent = guard.begin()

  assert.equal(firstIsCurrent(), false)
  assert.equal(secondIsCurrent(), true)
})

test('each new load invalidates every older load', () => {
  const guard = createLatestLoadGuard()
  const firstIsCurrent = guard.begin()
  const secondIsCurrent = guard.begin()
  const thirdIsCurrent = guard.begin()

  assert.equal(firstIsCurrent(), false)
  assert.equal(secondIsCurrent(), false)
  assert.equal(thirdIsCurrent(), true)
})

test('explicit invalidation retires the current load on unmount', () => {
  const guard = createLatestLoadGuard()
  const isCurrent = guard.begin()

  guard.invalidate()

  assert.equal(isCurrent(), false)
})
