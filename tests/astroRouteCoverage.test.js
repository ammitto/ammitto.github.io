import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verifyRouteCoverage } from '../scripts/verify-astro-routes.mjs'

test('coverage uses actual Astro outputs and excludes the host fallback', () => {
  verifyRouteCoverage([{ pathname: '' }, { pathname: 'api/' }, { pathname: '/404' }], [{ path: '/' }, { path: '/api' }])
})
test('an added Astro page cannot silently escape the browser sweep', () => {
  assert.throws(() => verifyRouteCoverage([{ pathname: '/' }, { pathname: '/new-page' }], [{ path: '/' }]), /uncovered \[\/new-page\]/)
})
test('a removed page cannot leave a stale browser fixture', () => {
  assert.throws(() => verifyRouteCoverage([{ pathname: '/' }], [{ path: '/' }, { path: '/removed' }]), /not built \[\/removed\]/)
})
