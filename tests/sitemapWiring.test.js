/**
 * The build must tell crawlers what exists — and must not tell them about
 * pages that answer 404.
 *
 * Neither file existed: `/robots.txt` and `/sitemap.xml` both returned 404 on
 * the live site, so nothing announced that this site had pages at all.
 *
 * The care is in what the sitemap LEAVES OUT. Every `@id` the API publishes is
 * a site URL — `https://www.ammitto.org/entity/uk/aqd0087` and 61,098 more —
 * and each of them resolves through the `404.html` SPA fallback, which GitHub
 * Pages serves with an HTTP 404 status. Measured on the live site: that URL
 * returns 404 with 18,031 bytes, byte-for-byte the size of `index.html`. The
 * page renders, because the shell arrives with that status and the router
 * takes over — but the status is what a crawler reads. Listing tens of
 * thousands of known-404 URLs in a sitemap is worse than listing none, so the
 * sitemap carries only routes the build actually pre-rendered.
 *
 * These are checks over source text, like the other *Wiring tests: they verify
 * what is written, not what a deployed host does with it. The generated files
 * themselves are asserted against `dist/` further down, but only when a build
 * is present.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(repoRoot, rel), 'utf8')

const CONFIG = 'vite.config.ts'

/** Strip comments, so prose describing the rule cannot satisfy it. */
const code = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('the build writes a sitemap and a robots.txt', () => {
  const config = code(read(CONFIG))
  assert.match(config, /writeFileSync\(\s*resolve\(dist, 'sitemap\.xml'\)/)
  assert.match(config, /writeFileSync\(\s*resolve\(dist, 'robots\.txt'\)/)
  assert.match(
    config,
    /Sitemap: \$\{SITE_ORIGIN\}\/sitemap\.xml/,
    'robots.txt must point at the sitemap, or nothing finds it',
  )
})

test('the sitemap is derived from what was built, never a hand-written list', () => {
  const config = code(read(CONFIG))
  // A hand-maintained list is how a sitemap comes to name a route that no
  // longer builds, or to miss one that does.
  assert.match(config, /function prerenderedRoutes/)
  assert.match(config, /readdirSync/)
  assert.match(
    config,
    /const routes = prerenderedRoutes\(dist\)/,
    'the sitemap must be generated from the walk, not from a literal array',
  )
})

test('route URLs are XML-escaped', () => {
  // No current route needs it — all 18 are plain ASCII paths — but a future
  // one carrying an `&` would emit invalid XML, and a malformed sitemap fails
  // at the crawler rather than at the build: silently, and only for the one
  // thing the file exists to do.
  const config = code(read(CONFIG))
  assert.match(config, /xmlEscape/)
  assert.match(
    config,
    /<loc>\$\{xmlEscape\(/,
    'the loc value must go through the escaper, not the raw string',
  )
})

test('the SPA fallback is excluded from the sitemap', () => {
  const config = code(read(CONFIG))
  // 404.html is the fallback shell, not a page. Listing it would submit the
  // site's own error document as content.
  assert.match(config, /name === '404\.html'/)
})

test('the generated sitemap lists no dynamic record route', () => {
  // The whole point. Skipped when there is no build to inspect, because the
  // unit suite does not build; CI runs the build before the browser tests.
  const sitemap = join(repoRoot, 'dist/sitemap.xml')
  if (!existsSync(sitemap)) return

  const xml = readFileSync(sitemap, 'utf8')
  for (const family of [
    'entity',
    'announcement',
    'group',
    'legal-instrument',
    'document-type',
    'organization',
  ]) {
    // `/browse/groups` and friends are pre-rendered and legitimate; a record
    // route is `/group/<source>/<id>`, so it is the singular form followed by
    // a further path segment that must be absent.
    const recordUrl = new RegExp(`<loc>[^<]*/${family}/[^<]+/[^<]+</loc>`)
    assert.ok(
      !recordUrl.test(xml),
      `sitemap lists a ${family} record URL; those answer HTTP 404`,
    )
  }

  // And it must not be empty, which would pass every check above.
  assert.match(xml, /<loc>https:\/\/www\.ammitto\.org\/<\/loc>/)
  assert.ok(
    (xml.match(/<loc>/g) || []).length >= 10,
    'sitemap looks truncated: fewer than ten routes',
  )
})

test('the generated robots.txt points at the sitemap', () => {
  const robots = join(repoRoot, 'dist/robots.txt')
  if (!existsSync(robots)) return

  const text = readFileSync(robots, 'utf8')
  assert.match(text, /^User-agent: \*$/m)
  assert.match(text, /^Sitemap: https:\/\/www\.ammitto\.org\/sitemap\.xml$/m)
})
