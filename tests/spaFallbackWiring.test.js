/**
 * Deep links must resolve, not 404.
 *
 * Six of the router's route families are dynamic — entity, announcement,
 * group, legal-instrument, document-type and organization. `vite-ssg`
 * pre-renders static routes only, so the build emitted nothing for any of
 * them. On GitHub Pages every one of those URLs returned the host's own
 * 404 page: clicking through the site worked, because that is the router
 * doing it, but sharing a link, bookmarking one or reloading did not.
 * That is every entity page on the site.
 *
 * Pre-rendering is not the answer at this corpus size. GitHub Pages
 * serves `404.html` for any unmatched path, so the build copies the app
 * shell there and the router resolves the URL itself.
 *
 * Nothing fails when the fallback goes missing: the build succeeds, the
 * suite stays green, and the site works for anyone already on it. Only a
 * visitor arriving from outside sees the difference, which is why this
 * file has to say so.
 *
 * These are SUBSTRING AND PATTERN CHECKS OVER SOURCE TEXT — they verify
 * what is written, not what evaluates, for the reason set out at the top
 * of birthWiring.test.js. Whether the deployed host honours 404.html is a
 * property of GitHub Pages and is not proved here.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => readFileSync(join(repoRoot, relative), 'utf8')

const CONFIG = 'vite.config.ts'
const ROUTER = 'src/router/index.ts'

/** Strip comments, so prose describing the rule cannot satisfy it. */
const code = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')

test('the build writes an SPA fallback', () => {
  const source = code(read(CONFIG))

  assert.match(
    source,
    /ssgOptions/,
    'vite.config.ts must configure vite-ssg',
  )
  assert.match(
    source,
    /onFinished\s*\(\s*\)/,
    'the fallback is written from an onFinished hook',
  )
  assert.match(
    source,
    /dist\/404\.html/,
    'the build must emit dist/404.html',
  )
  assert.match(
    source,
    /dist\/index\.html/,
    'the fallback is a copy of the rendered shell',
  )
})

test('a missing shell fails the build rather than shipping no fallback', () => {
  const source = code(read(CONFIG))

  // Copying a file that is not there would throw anyway, but silently
  // skipping it would not — and a build that quietly omits the fallback
  // restores the original bug without any signal.
  assert.match(
    source,
    /throw new Error\(/,
    'an absent dist/index.html must fail the build',
  )
})

test('the dynamic route families are still the ones covered', () => {
  const source = code(read(ROUTER))

  // If a seventh dynamic family is added, it is covered by the same
  // fallback automatically. This pins that the six known ones really are
  // parameterised, so the justification above stays true.
  for (const family of [
    'entity',
    'announcement',
    'group',
    'legal-instrument',
    'document-type',
    'organization',
  ]) {
    assert.match(
      source,
      new RegExp(`path:\\s*['"\`]/${family}/:`),
      `/${family} should be a dynamic route`,
    )
  }
})
