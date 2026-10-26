/**
 * Astro owns static pages; GitHub Pages uses its generated 404 document for
 * record routes not emitted as HTML. These checks validate the built-document
 * gate with fixtures. They cannot prove a deployed host serves the fallback.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prerenderedRoutes, verifyDetailFallback } from '../scripts/finalize-astro-build.mjs'

function fixture(run) {
  const dist = mkdtempSync(join(tmpdir(), 'ammitto-astro-fallback-'))
  try { run(dist) } finally { rmSync(dist, { recursive: true, force: true }) }
}

test('publication fails if Astro omits the homepage or fallback', () => {
  fixture(dist => {
    assert.throws(() => verifyDetailFallback(dist), /must emit/)
    writeFileSync(join(dist, 'index.html'), '<html>Home</html>')
    assert.throws(() => verifyDetailFallback(dist), /must emit/)
  })
})

test('a placeholder or unhydrated fallback fails publication', () => {
  fixture(dist => {
    writeFileSync(join(dist, 'index.html'), '<html>Home</html>')
    for (const body of ['<html>404</html>', '<div data-detail-fallback></div>']) {
      writeFileSync(join(dist, '404.html'), body)
      assert.throws(() => verifyDetailFallback(dist), /hydrated detail dispatcher/)
    }
    writeFileSync(join(dist, '404.html'), '<div data-detail-fallback><astro-island></astro-island></div>')
    assert.doesNotThrow(() => verifyDetailFallback(dist))
  })
})

test('the sitemap uses Astro directory routes and excludes fallback and API data', () => {
  fixture(dist => {
    for (const file of ['index.html', '404.html', 'search/index.html', 'api/v1/accidental.html']) {
      const path = join(dist, file)
      mkdirSync(join(path, '..'), { recursive: true })
      writeFileSync(path, '<html></html>')
    }
    writeFileSync(join(dist, 'ammitto-static-routes.json'), JSON.stringify({ version: 1, routes: ['/', '/api/', '/search/'] }))
    assert.deepEqual(prerenderedRoutes(dist), ['/', '/api/', '/search/'])
  })
})

test('the build finalizes Astro output after generating its search assets', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.match(pkg.scripts.build, /astro build/)
  assert.match(pkg.scripts.build, /build-search-runtime\.mjs dist.*finalize-astro-build\.mjs dist/)
})
