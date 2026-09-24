import { test, expect } from '@playwright/test'
import { collectPageErrors } from './helpers.js'

/**
 * Partial results while the search index builds ("progressive results").
 *
 * The page may show matches found so far, but on a sanctions register nothing
 * shown mid-load may read as a verdict. Recorded here from every DOM mutation
 * during a real build, so a state that exists for one frame is still caught:
 *
 * - no "No match found" card and no result count before the build finishes,
 *   including while zero matches have been found;
 * - every partial card matches the query and filters shown at that moment,
 *   and a card once shown neither moves nor disappears while they stand;
 * - the finished list is the same, in the same order, as the list the page
 *   gives for that query when it is typed after the index has loaded;
 * - the live region's TEXT, while loading, is empty or one "still searching"
 *   sentence per settled query. That is what a screen reader is given; what
 *   it actually speaks is up to the reader and is not checked here.
 *
 * Deterministic, not timing-dependent. Two things are replaced in the page
 * before any application code runs, and nothing in the application knows:
 *
 * - `performance.now` advances by exactly 1 per call. The build reads the
 *   clock once per 25 rows and yields after 40 units, so every step of the
 *   id pre-pass and of the build is exactly 1,000 rows whatever the CPU speed.
 * - `MessageChannel` holds its messages until the test releases them. That is
 *   the build's only way to yield (`yieldToEventLoop`), so the test decides
 *   when each step runs, and before releasing the next one waits until every
 *   short timer (the search debounce, the partial-refresh throttle) has fired.
 *
 * So each 1,000-row step is observed after its partial refresh has rendered,
 * on any machine. The corpus puts the names under test at known positions:
 * the early one has the query as a LATER word, so the finished index ranks it
 * last and a list that re-sorted mid-load would move it.
 */

const ROWS = 24000
const TARGETS = new Map([
  [900, { name: 'Acme Trading Zebulon Holdings', type: 'person' }],
  [12000, { name: 'Zebulon Kazan', type: 'organization' }],
  [22800, { name: 'Zebulon', type: 'person' }],
])
const href = (i) => `/entity/cn/p${i}`
const EARLY = href(900)

/** Which target rows a (query, type filter) pair may show. */
function allowed(query, typeFilter) {
  const q = query.trim().toLowerCase()
  if (!q) return new Set()
  return new Set(
    [...TARGETS]
      .filter(([, t]) => q.split(/\s+/).every((w) => t.name.toLowerCase().includes(w)))
      .filter(([, t]) => !typeFilter || t.type === typeFilter)
      .map(([i]) => href(i)),
  )
}

function syntheticIndex() {
  const entities = []
  for (let i = 0; i < ROWS; i++) {
    const t = TARGETS.get(i)
    const name = t?.name ?? `Filler Person ${i}`
    entities.push({
      id: `https://www.ammitto.org/entity/cn/p${i}`,
      ref: `cn/p${i}`,
      type: t?.type ?? 'person',
      names: [name],
      primaryName: name,
      authority: 'cn',
      status: 'active',
      country: i % 2 ? 'IRAN' : 'SYRIA',
    })
  }
  return {
    metadata: { generated: '2026-09-23T08:37:05Z', totalEntities: ROWS, sources: 1 },
    entities,
  }
}

const BODY = JSON.stringify(syntheticIndex())

/**
 * Optional CPU slowdown (E2E_CPU_RATE=4) to show the result does not depend on
 * machine speed. Off by default.
 */
const CPU_RATE = Number(process.env.E2E_CPU_RATE || 1)

async function serveSynthetic(page) {
  if (CPU_RATE > 1) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_RATE })
  }
  await page.route('**/api/v1/search-index.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: BODY }),
  )
}

/** Install the clock, the yield gate, the timer count and the state recorder. */
async function controlBuild(page) {
  await page.addInitScript(() => {
    let tick = 0
    performance.now = () => ++tick

    const Real = window.MessageChannel
    window.__held = []
    window.MessageChannel = function MessageChannel() {
      const ch = new Real()
      const post = ch.port2.postMessage.bind(ch.port2)
      ch.port2.postMessage = (m) => window.__held.push(() => post(m))
      return ch
    }
    window.__release = () => window.__held.shift()?.()

    // Short timers only: a long-lived one elsewhere must not stall the test.
    const pending = new Set()
    const realSet = window.setTimeout
    const realClear = window.clearTimeout
    window.setTimeout = (fn, ms, ...args) => {
      const short = !ms || ms <= 1000
      const id = realSet(() => {
        pending.delete(id)
        fn(...args)
      }, ms)
      if (short) pending.add(id)
      return id
    }
    window.clearTimeout = (id) => {
      pending.delete(id)
      realClear(id)
    }
    window.__timers = () => pending.size

    window.__states = []
    new MutationObserver(() => {
      const main = document.querySelector('main main')
      if (!main) return
      const banner = document.querySelector('[data-testid="search-progress"]')
      window.__states.push({
        input: document.querySelector('main input, input[type="search"], input')?.value ?? '',
        // Read from the pill, not the URL: the router updates the URL after
        // the render that applied the filter.
        type: [...document.querySelectorAll('aside button[aria-pressed="true"]')].some((b) =>
          b.textContent.includes('Organization'),
        )
          ? 'organization'
          : null,
        cards: [...document.querySelectorAll('[data-testid="search-results"] > a')].map((a) =>
          a.getAttribute('href'),
        ),
        banner: banner ? banner.textContent.trim() : null,
        bannerLive: banner ? banner.hasAttribute('aria-live') || banner.hasAttribute('role') : false,
        skeleton: !!document.querySelector('[data-testid="search-skeleton"]'),
        count: document.querySelector('[data-testid="search-count"]')?.textContent.trim() ?? null,
        noMatch: main.textContent.includes('No match found'),
        announced: document.querySelector('[role="status"]')?.textContent.trim() ?? '',
      })
    }).observe(document, {
      childList: true,
      subtree: true,
      characterData: true,
      // A filter pill toggling is an attribute change; record it even when no
      // text or card changes with it.
      attributes: true,
      attributeFilter: ['aria-pressed'],
    })
  })
}

/** Wait until the build is parked at a yield (or finished) and no short timer is pending. */
async function settle(page) {
  await page.waitForFunction(
    () =>
      window.__timers() === 0 &&
      (window.__held.length > 0 ||
        !!document.querySelector('[data-testid="search-count"]') ||
        (document.querySelector('main main')?.textContent ?? '').includes('No match found')),
    null,
    { timeout: 60000, polling: 20 },
  )
}

/**
 * Run the build one step at a time. `beforeStep(i)` runs with the page parked
 * after step i-1 has fully rendered. Returns the number of steps released.
 */
async function driveBuild(page, beforeStep = async () => {}) {
  // yieldToEventLoop falls back to setTimeout in a hidden tab, which the gate
  // would not hold; headless pages are visible, and this says so if not.
  expect(await page.evaluate(() => document.hidden)).toBe(false)
  for (let i = 0; i < 1000; i++) {
    await settle(page)
    if (await page.evaluate(() => window.__held.length === 0)) return i
    await beforeStep(i)
    await settle(page)
    await page.evaluate(() => window.__release())
  }
  throw new Error('the build never finished')
}

/** The live region's loading sentence: names the settled query, carries no count. */
const NOTICE = /^Searching for \u201c[^\u201d]+\u201d\. Records are still loading, so results are not complete yet\.$/
const notice = (q) =>
  `Searching for \u201c${q}\u201d. Records are still loading, so results are not complete yet.`

/** The live region's successive distinct texts: what it was given to announce. */
const announcements = (states) =>
  states.map((s) => s.announced).filter((a, i, all) => i === 0 || a !== all[i - 1])

const checkedOf = (banner) => {
  const m = banner?.match(/([\d,]+) of 24,000 records checked/)
  return m ? Number(m[1].replace(/,/g, '')) : null
}

/** Invariants that hold for every state recorded while the index was loading. */
function assertLoadingStates(states) {
  const loading = states.filter((s) => s.skeleton)
  expect(loading.length).toBeGreaterThan(0)
  for (const s of loading) {
    expect(s.noMatch, 'no negative while loading').toBe(false)
    expect(s.count, 'no result count while loading').toBeNull()
    expect(s.bannerLive, 'the banner is not a live region').toBe(false)
    if (s.announced) expect(s.announced).toMatch(NOTICE)
    const ok = allowed(s.input, s.type)
    for (const h of s.cards) expect(ok.has(h), `${h} does not match "${s.input}"`).toBe(true)
    if (s.banner) {
      expect(s.banner).toMatch(/not (finished|complete)/)
      expect(s.banner, 'the banner names the query in the input').toContain(`“${s.input.trim()}”`)
      if (s.cards.length === 0) expect(s.banner).toMatch(/^(No matches for|Searching for)/)
    } else {
      expect(s.cards, 'no partial cards without the banner').toEqual([])
    }
  }
  // Append-only while the query and filters stand.
  for (let i = 1; i < loading.length; i++) {
    const [a, b] = [loading[i - 1], loading[i]]
    if (a.input !== b.input || a.type !== b.type) continue
    expect(b.cards.slice(0, a.cards.length), 'a shown card moved or vanished').toEqual(a.cards)
  }
  return loading
}

/** The finished list for `query` when it is typed after the index has loaded. */
async function settledList(browser, query) {
  const page = await browser.newPage()
  await serveSynthetic(page)
  await page.goto('/search', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('search-count')).toBeVisible({ timeout: 60000 })
  await page.getByPlaceholder(/Search by name/).fill(query)
  await expect(page.getByTestId('search-count')).toContainText(/^3 results/)
  const hrefs = await page
    .locator('[data-testid="search-results"] > a')
    .evaluateAll((as) => as.map((a) => a.getAttribute('href')))
  await page.close()
  return hrefs
}

/**
 * Hold every timer while `window.__gate` is set, to be run one at a time by
 * `window.__step`. That makes "between two mounting steps" a state a test can
 * stop in, whatever the machine's speed.
 */
async function gateTimers(page) {
  await page.addInitScript(() => {
    const outerSet = window.setTimeout
    const outerClear = window.clearTimeout
    window.__gate = false
    window.__gated = []
    let fake = 1e9
    window.setTimeout = (fn, ms, ...args) => {
      if (!window.__gate) return outerSet(fn, ms, ...args)
      const id = ++fake
      window.__gated.push({ id, run: () => fn(...args) })
      return id
    }
    window.clearTimeout = (id) => {
      const i = window.__gated.findIndex((t) => t.id === id)
      if (i !== -1) window.__gated.splice(i, 1)
      else outerClear(id)
    }
    window.__step = () => window.__gated.shift()?.run()
  })
}

const partialCardCount = (page) => page.locator('[data-testid="search-results"] > a').count()

/** Park the build with 4,000 rows indexed, every one but p900 a "filler" match. */
async function parkWithFillerRows(page) {
  for (let i = 0; i < 26; i++) {
    await settle(page)
    await page.evaluate(() => window.__release())
  }
  await settle(page)
}

/** Run held timers until cards are on screen: the debounce, then the first mounting step. */
async function stepUntilCards(page) {
  for (let i = 0; i < 20 && (await partialCardCount(page)) === 0; i++) {
    await page.evaluate(() => window.__step())
  }
  return partialCardCount(page)
}

/** Run every held timer, then stop holding them. */
async function drainGated(page) {
  for (let i = 0; i < 200 && (await page.evaluate(() => window.__gated.length)) > 0; i++) {
    await page.evaluate(() => window.__step())
  }
  await page.evaluate(() => { window.__gate = false })
}

test.describe('search partial results while the index builds', () => {
  test.setTimeout(180000)

  test('grows an append-only list of real matches, then settles on the normal result', async ({
    page,
    browser,
  }) => {
    const errors = collectPageErrors(page)
    await controlBuild(page)
    await serveSynthetic(page)
    await page.goto('/search?q=zebulon', { waitUntil: 'domcontentloaded' })
    await driveBuild(page)
    await expect(page.getByTestId('search-count')).toContainText('3 results')

    const states = await page.evaluate(() => window.__states)
    const loading = assertLoadingStates(states)
    const banners = loading.filter((s) => s.banner)

    // Every stage is observed, deterministically: none, one, two matches.
    const withCards = (n) => banners.filter((s) => s.cards.length === n)
    expect(withCards(0).some((s) => s.banner.startsWith('No matches for “zebulon” yet'))).toBe(true)
    expect(withCards(1).map((s) => s.cards[0])).toContain(EARLY)
    expect(withCards(1).some((s) => checkedOf(s.banner) >= 1000 && checkedOf(s.banner) < 12000)).toBe(true)
    expect(withCards(2).length).toBeGreaterThan(0)
    expect(withCards(3).length).toBeGreaterThan(0)
    expect(banners.some((s) => s.banner.startsWith('3 matches for “zebulon” so far'))).toBe(true)

    // The progress count is the live one, and only rises.
    const checked = banners.map((s) => checkedOf(s.banner)).filter((n) => n !== null)
    expect(Math.max(...checked)).toBeGreaterThanOrEqual(23000)
    for (let i = 1; i < checked.length; i++) expect(checked[i]).toBeGreaterThanOrEqual(checked[i - 1])

    // One notice for the whole search, not one per refresh, then the result.
    expect(announcements(states).filter(Boolean)).toEqual([notice('zebulon'), '3 results'])

    const final = states[states.length - 1]
    expect(final.banner).toBeNull()
    expect(final.noMatch).toBe(false)
    expect(final.announced).toBe('3 results')
    expect(final.cards).toEqual(await settledList(browser, 'zebulon'))
    // The one re-sort happened: discovery order put the early row first.
    expect(withCards(3)[0].cards[0]).toBe(EARLY)
    expect(final.cards[0]).not.toBe(EARLY)
    expect(errors).toEqual([])
  })

  test('a query with no match says "no matches yet" until the build ends, then the dated negative', async ({
    page,
  }) => {
    const errors = collectPageErrors(page)
    await controlBuild(page)
    await serveSynthetic(page)
    await page.goto('/search?q=qqxzvw', { waitUntil: 'domcontentloaded' })
    await driveBuild(page)
    await expect(page.getByText('No match found')).toBeVisible()

    const states = await page.evaluate(() => window.__states)
    const loading = assertLoadingStates(states)
    const banners = loading.filter((s) => s.banner).map((s) => s.banner)
    expect(banners.some((b) => /^No matches for “qqxzvw” yet, 1,000 of 24,000 records checked/.test(b))).toBe(true)
    expect(banners.some((b) => /^No matches for “qqxzvw” yet, 2[0-9],000 of 24,000/.test(b))).toBe(true)
    // The negative appears only after the banner has gone, and carries its date.
    const firstNegative = states.findIndex((s) => s.noMatch)
    expect(firstNegative).toBeGreaterThan(-1)
    expect(states.slice(firstNegative).every((s) => s.banner === null)).toBe(true)
    await expect(page.locator('main main')).toContainText('Data as of 23 September 2026')
    expect(errors).toEqual([])
  })

  test('editing or clearing the query mid-build drops the old cards at once', async ({ page }) => {
    const errors = collectPageErrors(page)
    await controlBuild(page)
    await serveSynthetic(page)
    await page.goto('/search?q=zebulon', { waitUntil: 'domcontentloaded' })
    const input = page.getByPlaceholder(/Search by name/)

    // The id pre-pass parks 23 times, then each build step adds 1,000 rows:
    // before step i the index holds (i - 22) * 1,000 rows.
    await driveBuild(page, async (i) => {
      if (i === 26) await input.fill('kazan') // 4,000 rows: p900 shown for "zebulon"
      if (i === 36) await input.fill('') // 14,000 rows: p12000 shown for "kazan"
      if (i === 38) await input.fill('zebulon')
    })
    await expect(page.getByTestId('search-count')).toContainText('3 results')

    const states = await page.evaluate(() => window.__states)
    const loading = assertLoadingStates(states)
    const phase = (q) => loading.filter((s) => s.input === q)

    // Not vacuous: each phase was reached with the cards the test expects.
    expect(phase('zebulon').some((s) => s.cards.includes(EARLY))).toBe(true)
    expect(phase('kazan').some((s) => s.cards.join() === href(12000))).toBe(true)
    // The first state after the edit shows none of the old cards, and says so.
    const firstKazan = phase('kazan')[0]
    expect(firstKazan.cards).toEqual([])
    expect(firstKazan.banner).toBe(
      'Searching for “kazan”. The records are still loading, so the search is not finished.',
    )
    // One notice per settled query, the second search included, and never one
    // per refresh.
    expect(announcements(states).filter(Boolean)).toEqual([
      notice('zebulon'),
      notice('kazan'),
      notice('zebulon'),
      '3 results',
    ])
    // Cleared: back to placeholders, no banner, nothing announced.
    expect(phase('').length).toBeGreaterThan(0)
    for (const s of phase('')) {
      expect(s.banner).toBeNull()
      expect(s.cards).toEqual([])
      expect(s.announced).toBe('')
    }
    expect(errors).toEqual([])
  })

  test('changing a filter mid-build restarts the partial list under the filter', async ({ page }) => {
    const errors = collectPageErrors(page)
    await controlBuild(page)
    await serveSynthetic(page)
    await page.goto('/search?q=zebulon', { waitUntil: 'domcontentloaded' })

    await driveBuild(page, async (i) => {
      if (i === 26) { // 4,000 rows: p900 shown unfiltered
        await page.locator('aside').getByRole('button', { name: /Organization/ }).first().click()
      }
    })
    await expect(page.getByTestId('search-count')).toContainText('1 result')

    const states = await page.evaluate(() => window.__states)
    const loading = assertLoadingStates(states)
    expect(loading.some((s) => !s.type && s.cards.includes(EARLY))).toBe(true)
    const filtered = loading.filter((s) => s.type === 'organization')
    expect(filtered.length).toBeGreaterThan(0)
    expect(filtered.some((s) => s.cards.join() === href(12000))).toBe(true)
    expect(filtered.every((s) => !s.cards.includes(EARLY))).toBe(true)
    const final = states[states.length - 1]
    expect(final.cards).toEqual([href(12000)])
    expect(errors).toEqual([])
  })

  test('partial cards mount a few per task, and an edit cancels the ones still pending', async ({ page }) => {
    const errors = collectPageErrors(page)
    await controlBuild(page)
    await gateTimers(page)
    await serveSynthetic(page)
    await page.goto('/search', { waitUntil: 'domcontentloaded' })
    const input = page.getByPlaceholder(/Search by name/)

    await parkWithFillerRows(page)
    await page.evaluate(() => { window.__gate = true })
    await input.fill('filler')
    const firstStep = await stepUntilCards(page)
    expect(firstStep, 'one mounting step, not the whole first page').toBeGreaterThan(0)
    expect(firstStep).toBeLessThanOrEqual(6)
    await expect(page.getByTestId('search-progress')).toContainText(/^[\d,]+ matches for “filler” so far/)
    expect(await page.evaluate(() => window.__gated.length), 'more cards are waiting to mount').toBeGreaterThan(0)

    // The edit lands between two steps: nothing for "filler" may mount after it.
    await input.fill('zebulon')
    const afterEdit = await page.evaluate(() => window.__states.length)
    await drainGated(page)
    await driveBuild(page)
    await expect(page.getByTestId('search-count')).toContainText('3 results')

    const states = await page.evaluate(() => window.__states)
    const zebulon = allowed('zebulon', null)
    for (const s of states.slice(afterEdit)) {
      for (const h of s.cards) expect(zebulon.has(h), `${h} mounted after the edit to "${s.input}"`).toBe(true)
    }
    // While loading, no single render adds more than one step of cards, and
    // cards only append while the query stands.
    const loading = states.filter((s) => s.skeleton)
    for (let i = 1; i < loading.length; i++) {
      const [a, b] = [loading[i - 1], loading[i]]
      if (a.input !== b.input || a.type !== b.type) continue
      expect(b.cards.slice(0, a.cards.length), 'a shown card moved or vanished').toEqual(a.cards)
      expect(b.cards.length - a.cards.length, 'cards mounted in one render').toBeLessThanOrEqual(6)
    }
    expect(loading.some((s) => s.input === 'filler' && s.cards.length > 0)).toBe(true)
    expect(errors).toEqual([])
  })

  test('a filter change mid-build cancels the mounting steps still pending', async ({ page }) => {
    const errors = collectPageErrors(page)
    await controlBuild(page)
    await gateTimers(page)
    await serveSynthetic(page)
    await page.goto('/search', { waitUntil: 'domcontentloaded' })
    await parkWithFillerRows(page)

    await page.evaluate(() => { window.__gate = true })
    await page.getByPlaceholder(/Search by name/).fill('filler')
    const firstStep = await stepUntilCards(page)
    expect(firstStep).toBeGreaterThan(0)
    // The one held timer is the next mounting step.
    const held = await page.evaluate(() => window.__gated.map((t) => t.id))
    expect(held, 'more cards are waiting to mount').toHaveLength(1)

    // No filler row is an organization: nothing may mount once the filter is on.
    await page.locator('aside').getByRole('button', { name: /Organization/ }).first().click()
    // Checked on the timer itself: the change also empties the list, so a
    // step left pending would run harmlessly and no card check could see it.
    expect(
      await page.evaluate((ids) => window.__gated.filter((t) => ids.includes(t.id)).length, held),
      'the pending mounting step was not cancelled',
    ).toBe(0)
    const afterFilter = await page.evaluate(() => window.__states.length)
    await drainGated(page)
    await driveBuild(page)
    await expect(page.getByText('No match found')).toBeVisible()

    const states = await page.evaluate(() => window.__states)
    const after = states.slice(afterFilter).filter((s) => s.type === 'organization')
    expect(after.length).toBeGreaterThan(0)
    for (const s of after) expect(s.cards, 'a card for the old filter mounted after the change').toEqual([])
    expect(errors).toEqual([])
  })

  test('an append re-renders none of the cards already shown', async ({ page }) => {
    const errors = collectPageErrors(page)
    await controlBuild(page)
    await serveSynthetic(page)
    await page.goto('/search?q=filler', { waitUntil: 'domcontentloaded' })
    await parkWithFillerRows(page)
    await expect(page.locator('[data-testid="search-results"] > a')).toHaveCount(50)

    // Tag the first card's element, and hold the entity object its component
    // was given: an unchanged card keeps both across an append.
    // Found through the root vnode (`#app._vnode`), which a production build
    // keeps; the per-element component handles are development-only. `_vnode`
    // is a Vue internal: if a Vue release changes it the probe finds nothing
    // and the "probe found the first card" check below fails, never passes empty.
    const cardProps = () => {
      const walk = (vnode) => {
        if (!vnode || typeof vnode !== 'object') return undefined
        const c = vnode.component
        if (c) return c.props && 'entity' in c.props ? c.props.entity : walk(c.subTree)
        if (Array.isArray(vnode.children)) {
          for (const child of vnode.children) {
            const found = walk(child)
            if (found) return found
          }
        }
        return undefined
      }
      return walk(document.querySelector('#app')._vnode)
    }
    await page.evaluate((fn) => {
      const a = document.querySelector('[data-testid="search-results"] > a')
      a.dataset.tagged = '1'
      window.__heldEntity = new Function(`return (${fn})()`)()
    }, cardProps.toString())
    expect(
      await page.evaluate(() => window.__heldEntity?.names?.[0] ?? null),
      'the probe found the first card',
    ).toMatch(/^Filler Person /)
    const banner = page.getByTestId('search-progress')
    const matches = async () => Number((await banner.textContent()).match(/^([\d,]+) matches/)[1].replace(/,/g, ''))
    const before = await matches()

    // One more build step: 1,000 more matches, appended past the first page,
    // so the 50 cards on screen stay and the list they come from grows.
    await page.evaluate(() => window.__release())
    await settle(page)
    expect(await matches(), 'the step appended matches').toBe(before + 1000)
    await expect(page.locator('[data-testid="search-results"] > a')).toHaveCount(50)

    const same = await page.evaluate((fn) => {
      const a = document.querySelector('[data-testid="search-results"] > a')
      return {
        node: a.dataset.tagged === '1',
        entity: new Function(`return (${fn})()`)() === window.__heldEntity,
      }
    }, cardProps.toString())
    expect(same.node, 'the first card element was replaced').toBe(true)
    expect(same.entity, 'the first card was handed a new entity object, so it re-rendered').toBe(true)
    expect(errors).toEqual([])
  })
})
