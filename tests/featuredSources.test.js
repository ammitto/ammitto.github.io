/**
 * The featured selection the home page and footer present.
 *
 * Run with `npm run test:unit`; it imports the type-erased build of the real
 * config module (see tsconfig.test.json). A code missing from `sources` would
 * silently drop a tile rather than fail the build, and a second list from one
 * authority would spend a slot the major lists need, so both are checked here.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { featuredSourceCodes, featuredSources, siteConfig, sources } from '../.test-build/config/index.js'

test('every featured code names a catalogued source, once', () => {
  const catalogued = new Set(sources.map((source) => source.code))
  for (const code of featuredSourceCodes) {
    assert.ok(catalogued.has(code), `${code} is not in sources`)
  }
  assert.equal(new Set(featuredSourceCodes).size, featuredSourceCodes.length)
  assert.deepEqual(
    featuredSources.map((source) => source.code),
    [...featuredSourceCodes],
  )
})

test('no two featured sources come from the same authority', () => {
  const authorities = featuredSources.map((source) => source.authority)
  assert.equal(new Set(authorities).size, authorities.length)
})

test('the selection opens with the authorities the site description names', () => {
  // The hero sentence reads "EU, UN, US, and 10+ international sources" and
  // the badges beneath it are the first entries of this list.
  assert.match(siteConfig.description, /\bEU, UN, US\b/)
  assert.deepEqual(featuredSourceCodes.slice(0, 3), ['eu', 'un', 'us'])
})
