/**
 * The search page's loading placeholders must never say anything.
 *
 * While the index downloads and builds, the results area shows grey placeholder
 * cards instead of nothing. On a sanctions register that is only safe if the
 * placeholders are inert: no text a reader could file as a result, no second
 * voice for a screen reader, gone the moment the load settles, and absent when
 * the load has failed. Each of those is a template relationship, so this reads
 * the `.vue` source, in the style of searchEmptyStateWiring.test.js.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  new URL('../src/views/SearchPage.vue', import.meta.url),
  'utf8',
)

const MARKER = 'data-testid="search-skeleton"'

/** The skeleton block: its opening tag through its matching close. */
function skeleton() {
  const marker = source.indexOf(MARKER)
  assert.notEqual(marker, -1, `expected a placeholder block marked ${MARKER}`)
  const start = source.lastIndexOf('<div', marker)
  // Walk <div ...> / </div> pairs to find the block's own closing tag. The
  // placeholders are all self-closing divs or plain nested divs.
  const re = /<div\b[^>]*?(\/)?>|<\/div>/g
  re.lastIndex = start
  let depth = 0
  let m
  while ((m = re.exec(source))) {
    if (m[0].startsWith('</')) depth--
    else if (!m[1]) depth++
    if (depth === 0) {
      const openTag = source.slice(start, source.indexOf('>', start) + 1)
      return { start, openTag, block: source.slice(start, re.lastIndex) }
    }
  }
  assert.fail('the placeholder block is never closed')
}

test('the placeholders are gated on the index not being ready', () => {
  const { openTag } = skeleton()
  assert.match(
    openTag,
    /v-if="!isLoaded \|\| loading"/,
    'placeholders must show exactly while the results and the empty state ' +
      'are withheld, and give way to them the moment the load finishes',
  )
})

test('the placeholders never render alongside the load-failure card', () => {
  // The error card is `v-if="error"` and the results column is its `v-else`.
  // The placeholders must live inside that `v-else`, after it opens, so a
  // failed load shows the error and its Retry button and no placeholders
  // beside them to suggest a load is still in progress.
  const { start } = skeleton()
  const errorCard = source.indexOf('<div v-if="error"')
  assert.notEqual(errorCard, -1, 'expected the error card to be gated v-if="error"')
  const elseBranch = source.indexOf('<div v-else', errorCard)
  assert.notEqual(elseBranch, -1, 'expected the results column to be the error card\'s v-else')
  assert.ok(
    start > elseBranch,
    'the placeholders must sit inside the error card\'s v-else branch',
  )
})

test('the placeholders are hidden from assistive technology and add no live region', () => {
  const { openTag, block } = skeleton()
  assert.match(openTag, /aria-hidden="true"/, 'placeholder junk must not be read aloud')
  assert.ok(
    !/aria-live|role="status"|role="alert"/.test(block),
    'resultAnnouncement is the page\'s one live region; the placeholders must not add another',
  )
})

test('the placeholders carry no text and bind no data', () => {
  const { block } = skeleton()
  assert.ok(!/\{\{/.test(block), 'placeholders must interpolate nothing')
  const text = block.replace(/<[^>]*>/g, '').trim()
  assert.equal(text, '', 'placeholders must contain no text a reader could file as a result')
  assert.ok(
    !/:entity\b|EntityCard/.test(block),
    'placeholders must not render entity data',
  )
})

test('the placeholders are neither blurred nor animated', () => {
  // The compositor redraws a backdrop blur under an animation every frame,
  // which competes with the index build for the CPU while they are shown.
  const { block } = skeleton()
  assert.ok(!/\bglass-card\b|\bbackdrop-/.test(block), 'placeholders must not use a backdrop-blurred surface')
  assert.ok(!/\banimate-/.test(block), 'placeholders must not animate')
})

test('the placeholder count is a screenful, not a page', () => {
  const m = source.match(/const SKELETON_CARDS = (\d+)/)
  assert.ok(m, 'expected a SKELETON_CARDS constant')
  const page = Number(source.match(/const PAGE_SIZE = (\d+)/)[1])
  assert.ok(Number(m[1]) > 0 && Number(m[1]) <= 12 && Number(m[1]) < page)
})
