/** Published metadata comes from the real Astro route manifest. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { finalizeAstroBuild, prerenderedRoutes } from '../scripts/finalize-astro-build.mjs'

function fixture(run) {
  const dist = mkdtempSync(join(tmpdir(), 'ammitto-sitemap-'))
  try { run(dist) } finally { rmSync(dist, { recursive: true, force: true }) }
}

test('sitemap includes the API documentation, escapes URLs and omits the host fallback', () => {
  fixture(dist => {
    writeFileSync(join(dist, 'index.html'), '<html>Home</html>')
    writeFileSync(join(dist, '404.html'), '<div data-detail-fallback><astro-island></astro-island></div>')
    writeFileSync(join(dist, 'ammitto-static-assets.json'), JSON.stringify({ version: 1, files: [] }))
    writeFileSync(join(dist, 'ammitto-static-routes.json'), JSON.stringify({ version: 1, routes: ['/', '/api/', '/terms&use/', '/404/'] }))
    const result = finalizeAstroBuild(dist)
    assert.deepEqual(result.routes, ['/', '/api/', '/terms&use/'])
    const xml = readFileSync(join(dist, 'sitemap.xml'), 'utf8')
    assert.match(xml, /<loc>https:\/\/www\.ammitto\.org\/api\/<\/loc>/)
    assert.match(xml, /terms&amp;use/)
    assert.doesNotMatch(xml, /404/)
    assert.match(readFileSync(join(dist, 'robots.txt'), 'utf8'), /^Sitemap: https:\/\/www\.ammitto\.org\/sitemap\.xml$/m)
  })
})

test('an absent or invalid route manifest cannot silently create an incomplete sitemap', () => {
  fixture(dist => {
    assert.throws(() => prerenderedRoutes(dist), /ENOENT/)
    for (const routes of [[], ['/search/'], ['/', 'https://elsewhere.test/'], ['/', '/search?query/']]) {
      writeFileSync(join(dist, 'ammitto-static-routes.json'), JSON.stringify({ version: 1, routes }))
      assert.throws(() => prerenderedRoutes(dist), /manifest/)
    }
  })
})
