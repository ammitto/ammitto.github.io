/**
 * The site must not claim the rebuild fetches from the authorities.
 *
 * Two false claims have already shipped here and both were about freshness,
 * which is the fact a reader screening a name most depends on.
 *
 * The first was "synced daily" — promised in three places while no workflow
 * carried a `schedule:` trigger at all, so the site rebuilt only when someone
 * pushed. That was fixed by adding the nightly schedule.
 *
 * The second was subtler and is what this file pins. The replacement copy said
 * the data was generated "from the official sources listed above" and that the
 * corpus was "rebuilt nightly from the official sources". The nightly rebuild
 * does not contact any authority: it republishes what has already been
 * collected, and each list is collected from its own authority on a separate
 * schedule. So the published date is when THIS COPY was built, and an
 * individual list can be older than it.
 *
 * The distinction matters because the two readings differ by however long a
 * source has gone uncollected, and the page gives a reader no way to tell.
 * Saying "built" rather than "generated from the sources" is the whole fix.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')

/** Strip comments, so prose explaining the rule cannot satisfy or violate it. */
const copy = (source) =>
  source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const PAGES = ['src/views/SourcesPage.vue', 'src/views/HomePage.vue']

test('no page claims a cadence the pipeline does not keep', () => {
  for (const page of PAGES) {
    const text = copy(read(page))
    assert.ok(
      !/synced daily|synchronized daily/i.test(text),
      `${page} promises a sync cadence again`,
    )
  }
})

test('no page says the rebuild draws from the authorities', () => {
  for (const page of PAGES) {
    const text = copy(read(page))
    // The rebuild republishes already-collected data. Any phrasing that ties
    // the rebuild to the sources tells the reader the data is as fresh as the
    // build, which is the error being pinned.
    assert.ok(
      !/rebuilt .{0,30}from the official sources/i.test(text),
      `${page} says the rebuild fetches from the official sources`,
    )
    assert.ok(
      !/generated[\s\S]{0,80}from the official sources/i.test(text),
      `${page} says the data was generated from the official sources`,
    )
  }
})

test('the sources page tells the reader a list can be older than the date', () => {
  // The positive half. Removing the false claim without stating the real
  // limitation would leave a date the reader still reads as the age of every
  // record.
  const text = copy(read('src/views/SourcesPage.vue'))
  assert.match(
    text,
    /built/,
    'the date must be described as when the copy was built',
  )
  assert.match(
    text,
    /older than that\s*\n?\s*date|can be older/,
    'the page must say an individual list can be older than the build date',
  )
})
