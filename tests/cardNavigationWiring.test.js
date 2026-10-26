/**
 * The search result card must stay a link.
 *
 * `EntityCard` was an `<article>` with a `@click` handler calling
 * `router.push`. It navigated on a mouse click and did nothing else: not
 * focusable, no role to announce, no Enter activation, no new-tab, no
 * copy-link-address. Since the card is how a visitor opens any result,
 * that closed the whole site to keyboard users.
 *
 * Nothing fails when the handler comes back — the card still navigates on
 * click, and every other test stays green — which is exactly why this file
 * has to say so. The regression is invisible to anyone using a mouse.
 *
 * Keyboard operation itself is proved by driving a real browser, not here.
 * These are SUBSTRING AND PATTERN CHECKS OVER SOURCE TEXT — they verify
 * what is written, not what evaluates, for the reason set out at the top of
 * birthWiring.test.js. They pin the element choice so a later refactor
 * cannot quietly undo it; they are not a substitute for that proof.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => readFileSync(join(repoRoot, relative), 'utf8')

/** Collapse whitespace so a reformat does not fail the contract. */
const flatten = (source) => source.replace(/\s+/g, ' ')

const CARD = 'src/components/molecules/EntityCard.vue'

test('the entity card is a native anchor with its complete entity path', () => {
  const source = read(CARD)
  assert.match(source, /<a\b/)
  assert.doesNotMatch(source, /from\s+['"]vue-router['"]/)
  // Keep the slash in refs such as uk/aqd0087 as a path separator.
  assert.ok(
    flatten(source).includes(':href="`/entity/${entity.ref}`"'),
    `${CARD} must expose the entity path as a native href`,
  )
})

/**
 * The shapes an author undoing this would reach for. Navigating from a
 * handler is the original defect; `tabindex` with a key listener is the
 * near miss that looks like a fix and still loses new-tab, the context
 * menu and the crawlable href.
 *
 * Each pattern matches a binding or a call — an `=` after the directive,
 * a `(` after the method — never the bare word, so the comment in the
 * component naming the shape it replaced does not trip its own ban.
 */
const HANDLER_NAVIGATION = [
  { name: 'a router instance', pattern: /\buseRouter\s*\(/ },
  { name: 'an imperative push', pattern: /\brouter\s*\.\s*push\s*\(/ },
  { name: 'a click handler', pattern: /@click(\.\w+)*\s*=/ },
  { name: 'a hand-rolled tab stop', pattern: /\btabindex\s*=/ },
  { name: 'a hand-rolled key handler', pattern: /@key(down|up)(\.\w+)*\s*=/ },
]

test('the entity card does not navigate from a handler', () => {
  const source = read(CARD)

  for (const { name, pattern } of HANDLER_NAVIGATION) {
    assert.equal(
      pattern.test(source),
      false,
      `${CARD} carries ${name}; a link already brings focus, Enter, middle-click and copy-link-address`,
    )
  }
})

test('the focused card is visible to the person focusing it', () => {
  const source = read(CARD)

  // The card suppresses the user agent's own focus ring, so it owes one of
  // its own. Dropping the ring while keeping `outline-none` would leave a
  // keyboard user tabbing through the grid with nothing to look at, and no
  // test would notice.
  if (/focus-visible:outline-(?:none|hidden)/.test(source)) {
    assert.match(
      source,
      /focus-visible:ring-2/,
      `${CARD} removes the default focus ring and must draw its own`,
    )
  }
})

test('a decorative type icon is hidden if the record row renders one', () => {
  // Every child of the card is now part of one link's accessible name.
  // The icon duplicates the word printed beside it, so announcing it only
  // prefixes each result with the emoji's own description.
  const source = flatten(read(CARD))
  if (source.includes('typeInfo?.icon')) assert.ok(
    source.includes('<span aria-hidden="true">{{ typeInfo?.icon }}</span>'),
    `${CARD} must hide any decorative type icon from assistive technology`,
  )
  assert.ok(source.includes(':aria-labelledby="titleId"'), 'the native link is named by its complete record title')
})
