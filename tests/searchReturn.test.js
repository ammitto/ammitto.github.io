import test from 'node:test'
import assert from 'node:assert/strict'
import { validSearchReturn, storeSearchReturn, requestSearchReturn, consumeSearchReturnRequest } from '../.test-build/utils/searchReturn.js'

const now = Date.parse('2026-10-16T12:00:00Z')
const context = { path: '/search?q=General&source=cn', loadedCount: 100, scrollY: 5500,
  offsetTop: 210, entityRef: 'cn/1-general-dynamics', savedAt: now - 1000 }

test('a valid return preserves source/query, loaded range and originating viewport anchor', () => {
  assert.deepEqual(validSearchReturn(context, now), context)
})
test('return locations cannot leave the application search route', () => {
  for (const path of ['https://example.com/search', '//example.com/search', '/searching', '/entity/cn/1', '/search#other']) {
    assert.equal(validSearchReturn({ ...context, path }, now), null, path)
  }
})
test('obsolete, future and malformed reading positions are ignored', () => {
  for (const patch of [{ savedAt: now - 86400001 }, { savedAt: now + 1 }, { scrollY: -1 },
    { scrollY: Infinity }, { offsetTop: NaN }, { loadedCount: 100001 }, { loadedCount: 0 },
    { loadedCount: 50.5 }, { entityRef: '' }]) {
    assert.equal(validSearchReturn({ ...context, ...patch }, now), null, JSON.stringify(patch))
  }
})

test('explicit native return is recorded for the selected record and consumed once', () => {
  const values = new Map()
  globalThis.window = { sessionStorage: {
    setItem(key, value) { values.set(key, value) },
    getItem(key) { return values.get(key) ?? null },
    removeItem(key) { values.delete(key) },
  } }
  try {
    storeSearchReturn(context)
    assert.equal(consumeSearchReturnRequest(context.path), false, 'ordinary search navigation does not restore')
    requestSearchReturn('cn/a-different-record')
    assert.equal(consumeSearchReturnRequest(context.path), false)
    requestSearchReturn(context.entityRef)
    assert.equal(consumeSearchReturnRequest(context.path), true)
    assert.equal(consumeSearchReturnRequest(context.path), false)
    requestSearchReturn(context.entityRef)
    assert.equal(consumeSearchReturnRequest('/search'), false, 'a different filter URL does not restore')
    assert.equal(consumeSearchReturnRequest(context.path), false, 'unmatched intent cannot leak into a later visit')
  } finally { delete globalThis.window }
})
