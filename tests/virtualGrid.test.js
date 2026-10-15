import test from 'node:test'
import assert from 'node:assert/strict'
import { gridOffsets, gridRows, rowAt } from '../.test-build/utils/virtualGrid.js'

test('row geometry uses the taller card, gaps and an incomplete final row', () => {
  assert.deepEqual(gridOffsets(5, 2, [100, 140, 60, 80, 120]), [0, 156, 252, 388])
  assert.deepEqual(gridOffsets(3, 1, [100, undefined, 120], 180), [0, 116, 312, 448])
  assert.deepEqual(gridOffsets(0, 2, []), [0])
})

test('row lookup clamps to both boundaries and changes at an exact row start', () => {
  const offsets = [0, 100, 250, 400]
  assert.equal(rowAt(offsets, -100), 0)
  assert.equal(rowAt(offsets, 99), 0)
  assert.equal(rowAt(offsets, 100), 1)
  assert.equal(rowAt(offsets, 249), 1)
  assert.equal(rowAt(offsets, 250), 2)
  assert.equal(rowAt(offsets, 10000), 2)
  assert.equal(rowAt([0], 100), 0)
})

test('a large list mounts viewport rows with bounded overscan and reaches the last row', () => {
  const offsets = gridOffsets(10000, 2, [], 184)
  assert.deepEqual(gridRows(offsets, 0, 600), [0, 1, 2, 3, 4, 5])
  assert.deepEqual(gridRows(offsets, 1000, 600), [3, 4, 5, 6, 7, 8, 9, 10])
  assert.deepEqual(gridRows(offsets, 999900, 600), [4997, 4998, 4999])
  assert.deepEqual(gridRows([0], 0, 600), [])
})

test('a focused offscreen row is retained once without filling the gap', () => {
  const offsets = gridOffsets(1000, 2, [], 184)
  assert.deepEqual(gridRows(offsets, 1000, 200, 1, 0), [0, 4, 5, 6, 7])
  assert.deepEqual(gridRows(offsets, 1000, 200, 1, 5), [4, 5, 6, 7])
  assert.deepEqual(gridRows(offsets, 1000, 200, 1, 600), [4, 5, 6, 7])
})

test('responsive columns recompute every row from measured card heights', () => {
  const heights = [80, 200, 100]
  assert.deepEqual(gridOffsets(3, 2, heights), [0, 216, 332])
  assert.deepEqual(gridOffsets(3, 1, heights), [0, 96, 312, 428])
})
