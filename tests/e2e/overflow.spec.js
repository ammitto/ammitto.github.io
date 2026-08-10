import { test, expect } from '@playwright/test'
import { ALL_ROUTES, NARROW_VIEWPORTS } from '../routes.js'
import {
  collectPageErrors,
  expectNoHorizontalOverflow,
  gotoRendered,
  useTheme,
} from './helpers.js'

/**
 * No page may scroll horizontally on a phone.
 *
 * The defect this guards: result cards are grid items, and a grid item's
 * default `min-width: auto` makes the track at least as wide as the item's
 * min-content. The card's name and alias lines use `truncate`
 * (white-space: nowrap), whose min-content is the FULL string — so one long
 * sanctioned name stretched the grid, and with it the page, to 1044px inside a
 * 390px viewport on /search and /browse/entities (and 632px on
 * /browse/organizations). `min-w-0` on the card is the fix.
 *
 * Two layers here:
 *  1. every route, both themes, 320px (the WCAG 1.4.10 reflow width) and 390px,
 *     against the data the repository actually ships;
 *  2. a deterministic worst case, where the search index is served back with
 *     pathological names so the assertion does not depend on today's snapshot
 *     happening to contain a long enough name.
 */

/** A name long enough to blow out a 320px track, with no break opportunity. */
const UNBREAKABLE_NAME = 'MUHAMMADSAYYIDABDULRAHMANALJAZEERAALMUHANDISALQADIMIYAHORGANISATION'
const LONG_ALIAS = 'Sociedad Anonima de Transportes Maritimos Internacionales de Larga Distancia'

for (const theme of ['light', 'dark']) {
  for (const viewport of NARROW_VIEWPORTS) {
    for (const route of ALL_ROUTES) {
      test(`${route.path} does not scroll horizontally at ${viewport.name}px (${theme})`, async ({
        page,
      }) => {
        const errors = collectPageErrors(page)
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        await useTheme(page, theme)
        await gotoRendered(page, route.path)

        // The route must actually have rendered its content. A page that
        // silently fell back to an empty or error state has nothing to
        // overflow with and would "pass" this test while proving nothing.
        // Visible text of the whole document is the check, not a single
        // element: at 320px parts of the chrome (the desktop nav) are
        // display:none, and a sentinel that happened to land there would fail
        // a visibility assertion for the wrong reason.
        const rendered = await page
          .locator('body')
          .innerText()
          .then((text) => text.replace(/\s+/g, ' '))
        expect(
          rendered.length,
          `${route.path} rendered almost no text — the page did not load`,
        ).toBeGreaterThan(200)
        expect(
          rendered,
          `${route.path} never rendered its expected content ("${route.contains}")`,
        ).toContain(route.contains)

        const themeApplied = await page.evaluate(() =>
          document.documentElement.classList.contains('dark'),
        )
        expect(themeApplied, `theme "${theme}" was not applied to <html>`).toBe(theme === 'dark')

        await expectNoHorizontalOverflow(page, `${route.path} @${viewport.name}px ${theme}`)
        expect(errors, `${route.path} threw: ${errors.join('\n')}`).toEqual([])
      })
    }
  }
}

/**
 * The deterministic worst case. The fixture is derived from the response the
 * site itself serves, with only the names replaced, so it cannot drift away
 * from the producer's schema the way a hand-written fixture would.
 */
for (const viewport of NARROW_VIEWPORTS) {
  test(`result cards contain a pathologically long name at ${viewport.name}px`, async ({
    page,
    request,
  }) => {
    const response = await request.get('/api/v1/search-index.json')
    expect(response.ok(), 'the committed search index must be servable').toBeTruthy()
    const real = await response.json()
    expect(Array.isArray(real.entities) && real.entities.length > 0).toBeTruthy()

    const poisoned = {
      ...real,
      entities: real.entities.slice(0, 12).map((entity, i) => ({
        ...entity,
        names: [
          i === 0 ? UNBREAKABLE_NAME : `${LONG_ALIAS} ${i}`,
          LONG_ALIAS,
          `${LONG_ALIAS} (formerly known as)`,
        ],
        primaryName: i === 0 ? UNBREAKABLE_NAME : `${LONG_ALIAS} ${i}`,
        country: 'The Democratic Socialist Republic of Somewhere Very Long Indeed',
      })),
    }

    await page.route('**/api/v1/search-index.json', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(poisoned),
      }),
    )

    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await gotoRendered(page, '/search')

    // Prove the pathological data really reached the DOM before measuring.
    const card = page.locator('article').filter({ hasText: UNBREAKABLE_NAME }).first()
    await expect(card, 'the long-name fixture never rendered a result card').toBeVisible({
      timeout: 15000,
    })

    await expectNoHorizontalOverflow(page, `/search with a ${UNBREAKABLE_NAME.length}-character name`)

    // And that the card itself stayed inside the viewport, not merely that the
    // document did not scroll (an ancestor with overflow:hidden could hide it).
    const box = await card.boundingBox()
    expect(box.width).toBeLessThanOrEqual(viewport.width)
  })
}
