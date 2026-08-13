import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { CONTRAST_SCAN_ROUTES } from '../routes.js'
import { collectPageErrors, gotoRendered, serveSourceGraphs, useTheme } from './helpers.js'

/**
 * Rendered-DOM contrast, as a second and independent opinion.
 *
 * `tests/contrast.test.js` proves the tokens in `src/config/palette.ts` are
 * legible. It cannot prove that a component actually uses them: a future
 * hard-coded hex, a mistyped custom property, a `.tone-pill` class that never
 * made it into the markup, or a Tailwind utility winning the cascade would all
 * leave that suite green. Axe reads the colours the browser computed, so it
 * sees exactly those bypasses.
 *
 * Scope is deliberate and narrow: only the `color-contrast` rule, only on the
 * pages this remediation owns, and no suppression of a violation — an
 * allowlist of failing nodes is how this kind of check rots. Broadening to the
 * rest of axe's rules is a separate accessibility task, not something to
 * smuggle in behind a colour fix.
 *
 * The one list below is not that. It covers nodes axe declines to DECIDE, and
 * every entry has to say where the pair is decided instead — so it adds
 * coverage where axe has none rather than removing coverage axe had.
 */

/**
 * The reasons axe is permitted to decline to decide, per route.
 *
 * "Incomplete" is not a pass. It is axe saying it cannot compute the pair at
 * all, and a page that quietly turns a failing pair into an undecidable one
 * would otherwise stay green forever — text moved over a gradient or a
 * photograph reads exactly like text that was fixed. So every incomplete node
 * has to match an entry here, and every entry names the element, the route,
 * why axe cannot decide it, and where the pair is decided instead.
 *
 * Every entry below is a limit of what axe will judge, not a defect hidden
 * behind it: a decorative gradient it will not average, a number too short
 * for it to accept as text, a glyph it will not call text. None can be
 * removed without changing the design, and each has a real measurement
 * elsewhere. That is the bar, and `measuredBy` is where an entry meets it.
 * An incomplete node caused by something genuinely obscuring the text does
 * NOT belong here — it belongs fixed.
 *
 * A node must match BOTH the reason and the element scope. Reason alone was
 * not enough: it let an entry written about six named nodes in the hero
 * accept any future element anywhere on `/` that happened to land over a
 * gradient, and an entry written about one triangle glyph accept any non-text
 * character anywhere on `/ontology`. The scope is expressed as `within` (a
 * container the node must sit inside) and `is` (what the node itself must be)
 * rather than as axe's own `target`, because `target` is a minimal CSS
 * selector regenerated from whatever surrounds the node — `.md\:text-xl` one
 * day, a `:nth-child` chain the next. Both halves are resolved against the
 * live DOM, so they say what the prose in `element` says.
 *
 * This list is meant to shrink.
 */
const ALLOWED_INCOMPLETE = [
  {
    routes: ['/'],
    reason: /bgGradient|background gradient/i,
    // The hero's own section, and the four kinds of node inside it that the
    // gradient sits behind: tagline, description, stat figure, stat label.
    within: '.hero-section',
    is: 'h1, p, .text-3xl.font-bold.text-brand-link, .text-center > .text-sm',
    element:
      'HeroSection.vue — the tagline (h1), the description, the three stat ' +
      'figures and their labels, all sitting over the hero\'s decorative ' +
      '`absolute inset-0 bg-gradient-to-br` overlay',
    why:
      'axe stops at the first background it cannot reduce to a single ' +
      'colour, and a gradient is one. Removing the undecidability means ' +
      'removing the gradient, which is a design decision and not a contrast ' +
      'fix. Note that the same nodes are reported under the reason below ' +
      'instead when one of the hero\'s async counts is still short enough ' +
      'for that check to short-circuit first — observed both ways on ' +
      '2026-08-13, which is why the hero needs both entries and not a guess ' +
      'about which check wins.',
    measuredBy:
      '"text over the hero gradient still clears AA" in tests/contrast.test.js ' +
      'composites the gradient\'s own endpoints — parsed out of this ' +
      'component, so it cannot drift from it — over the page background, and ' +
      'measures every role that appears on it: body text, muted text, and ' +
      'the brand-link stat figures.',
  },
  {
    routes: ['/'],
    reason: /shortTextContent|content is too short/i,
    // Only the figures. Their labels are words, so a label reported as "too
    // short to be text" would be something else going wrong.
    within: '.hero-section',
    is: '.text-3xl.font-bold.text-brand-link',
    element:
      'HeroSection.vue — the stat figures, ' +
      '`.text-3xl.font-bold.text-brand-link` in the three stat blocks',
    why:
      'Each renders a short number, and axe will not assume a one- or ' +
      'two-character string is text rather than an icon glyph, so it declines ' +
      'to compute a ratio. Which figures are reported moves with the data: ' +
      'the entity count is long once its comma-grouped value arrives, and ' +
      'short before then. There is nothing to fix in the markup — these are ' +
      'genuine numbers with a genuine colour pair, and the undecidability is ' +
      'entirely a property of the heuristic.',
    measuredBy:
      '"link text clears AA on every surface of its theme" measures ' +
      'brand-link against each surface, and "text over the hero gradient ' +
      'still clears AA" measures it against the gradient these figures ' +
      'actually sit on — at 3:1, because at text-3xl bold they are large ' +
      'text. Both are in tests/contrast.test.js.',
  },
  {
    routes: ['/ontology'],
    reason: /nonBmp|only non-text characters/i,
    // Inside the expander button specifically, not anywhere in the tree: the
    // row's other glyphs are entity-type icons on a different token, and a
    // future one is not covered by this entry's measurement.
    within: '.hierarchy-row button[aria-expanded]',
    is: 'span[aria-hidden="true"]',
    element:
      'OntologyBrowserPage.vue — the `aria-hidden` glyph inside the class ' +
      "hierarchy's expand/collapse button (▶ / ▼)",
    why:
      'The button\'s visible content is one geometric character, and axe ' +
      'cannot tell a glyph used as an icon from text. `aria-hidden` does not ' +
      'and should not exempt it: a sighted reader still sees the shape, so ' +
      'the pair is real even though axe will not judge it. The accessibility ' +
      'defect that WAS here — a bare <span> with a click handler, no role, ' +
      'no name and no way to reach it from a keyboard — is fixed in this ' +
      'change, as is the selection control beside it; what is left is only ' +
      'the measurement artefact.',
    measuredBy:
      'The glyph is painted with the muted token (text-light-muted / ' +
      'dark:text-dark-muted), which "body and muted text clear AA on every ' +
      'surface of their theme" in tests/contrast.test.js measures against ' +
      'every surface of both themes.',
  },
]

/** Everything axe said about a node, as one string to match a reason against. */
const reasonText = (node) =>
  [
    node.failureSummary ?? '',
    ...[...(node.any ?? []), ...(node.all ?? []), ...(node.none ?? [])].map(
      (check) => `${check.message ?? ''} ${check.data?.messageKey ?? ''}`,
    ),
  ]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Does the node axe reported sit where an entry says it does?
 *
 * Resolved in the page rather than by string-matching `node.target`, so the
 * scope survives axe regenerating its selector. `querySelectorAll` and an
 * `every`, not `querySelector`: axe's target is meant to be unique, and if it
 * ever is not, an ambiguous selector must not be able to satisfy the entry by
 * happening to resolve to the one element that fits.
 */
async function matchesScope(page, node, { within, is }) {
  return page.evaluate(
    ([selector, within, is]) => {
      const found = [...document.querySelectorAll(selector)]
      if (found.length === 0) return false
      return found.every((el) => (within ? Boolean(el.closest(within)) : true) && el.matches(is))
    },
    [node.target.join(' '), within, is],
  )
}

async function isAllowedIncomplete(page, routePath, node) {
  for (const entry of ALLOWED_INCOMPLETE) {
    if (!entry.routes.includes(routePath)) continue
    if (!entry.reason.test(reasonText(node))) continue
    if (await matchesScope(page, node, entry)) return true
  }
  return false
}

for (const theme of ['light', 'dark']) {
  for (const route of CONTRAST_SCAN_ROUTES) {
    test(`${route.path} has no computed contrast violations (${theme})`, async ({
      page,
      request,
    }) => {
      const errors = collectPageErrors(page)
      await page.setViewportSize({ width: 1280, height: 900 })
      await useTheme(page, theme)
      if (route.needsSourceGraph) await serveSourceGraphs(page, request)
      await gotoRendered(page, route.path)

      // The scan is worthless if the component under test never rendered.
      await expect(
        page.locator(route.requires).first(),
        `${route.path} rendered without "${route.requires}" — nothing to scan`,
      ).toBeVisible({ timeout: 15000 })

      const results = await new AxeBuilder({ page })
        .withRules(['color-contrast'])
        .disableRules([])
        .analyze()

      const describe = (nodes) =>
        nodes
          .map((n) => `${n.target.join(' ')}\n      ${n.failureSummary?.replace(/\n/g, ' ')}`)
          .join('\n    ')

      expect(
        results.violations.flatMap((v) => v.nodes),
        `axe colour-contrast violations on ${route.path} (${theme}):\n    ${describe(
          results.violations.flatMap((v) => v.nodes),
        )}`,
      ).toEqual([])

      // "Incomplete" is axe declining to decide — text over a gradient or an
      // image, usually. It is not a pass, and it is not allowed to become a
      // hiding place: a pair that starts failing and then becomes undecidable
      // would look identical to a pair that was fixed. Every such node is
      // therefore matched against ALLOWED_INCOMPLETE above, which names the
      // reason, the route, and where the pair is measured instead. Anything
      // else fails here.
      const incomplete = results.incomplete.flatMap((v) => v.nodes)
      if (incomplete.length > 0) {
        test.info().annotations.push({
          type: 'axe-incomplete',
          description: `${route.path} (${theme}): ${incomplete.length} node(s) axe could not decide:\n    ${describe(
            incomplete,
          )}`,
        })
      }

      const unreviewed = []
      for (const node of incomplete) {
        if (!(await isAllowedIncomplete(page, route.path, node))) unreviewed.push(node)
      }
      expect(
        unreviewed.map((node) => `${node.target.join(' ')}: ${reasonText(node)}`),
        `axe could not decide the contrast of ${unreviewed.length} node(s) on ${route.path} ` +
          `(${theme}), and no reviewed entry in ALLOWED_INCOMPLETE covers them. Undecidable is ` +
          `not passing: decide the pair (make the background one resolvable colour), or add an ` +
          `entry naming the reason AND the element scope it covers, and where the pair is ` +
          `measured instead.`,
      ).toEqual([])

      expect(errors, `${route.path} threw: ${errors.join('\n')}`).toEqual([])
    })
  }
}

/**
 * The allowance must be narrower than the route.
 *
 * The scan above passes when nothing is unreviewed, which is also what it
 * looks like when an entry accepts everything — so a scope that had rotted
 * into a wildcard would be invisible there. This drives both answers out of
 * the matcher on the same page: the hero's real tagline is covered, and an
 * element that is not in the hero is not, for the same reason string. Before
 * the scope existed the second of these was accepted, which is the defect.
 */
test('an incomplete node outside the entry\'s element scope is not allowed', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await useTheme(page, 'light')
  await gotoRendered(page, '/')
  await expect(page.locator('.hero-section h1')).toBeVisible({ timeout: 15000 })

  const gradient = { failureSummary: "Element's background color could not be determined due to a background gradient" }
  const short = { failureSummary: 'Element content is too short to determine if it is actual text content' }

  await expect(
    isAllowedIncomplete(page, '/', { ...gradient, target: ['.hero-section h1'] }),
    'the hero tagline over the gradient is the node the entry was written for',
  ).resolves.toBe(true)

  // Planted outside the hero, carrying exactly the reason the entry allows.
  await page.evaluate(() => {
    const el = document.createElement('p')
    el.id = 'scope-probe'
    el.textContent = 'not in the hero'
    document.body.appendChild(el)
  })
  await expect(
    isAllowedIncomplete(page, '/', { ...gradient, target: ['#scope-probe'] }),
    'an element outside .hero-section is accepted by the hero entry — the scope is a wildcard',
  ).resolves.toBe(false)
  await expect(
    isAllowedIncomplete(page, '/', { ...short, target: ['#scope-probe'] }),
    'an element outside .hero-section is accepted by the stat-figure entry',
  ).resolves.toBe(false)

  // And inside the hero but not one of the shapes the entry names: a stat
  // LABEL is words, so "too short to be text" about one is something else.
  await expect(
    isAllowedIncomplete(page, '/', {
      ...short,
      target: ['.hero-section .text-center > .text-sm'],
    }),
    'the stat-figure entry accepts the stat labels too, which it does not measure',
  ).resolves.toBe(false)
})

/**
 * The two colours the palette work introduced must actually reach the browser,
 * and must differ by theme. This is the wiring check the token tests cannot
 * make: it reads `getComputedStyle` on real elements.
 */
test('badge and link colours differ between the themes in the rendered page', async ({
  browser,
}) => {
  const read = async (theme) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await useTheme(page, theme)
    await gotoRendered(page, '/search')
    await expect(page.locator('.tone-pill').first()).toBeVisible({ timeout: 15000 })
    const value = await page.evaluate(() => {
      const pill = document.querySelector('.tone-pill')
      const link = document.querySelector('a.text-brand-link, .text-brand-link')
      const style = getComputedStyle(pill)
      return {
        pillColor: style.color,
        pillBackground: style.backgroundColor,
        linkColor: link ? getComputedStyle(link).color : null,
      }
    })
    await context.close()
    return value
  }

  const light = await read('light')
  const dark = await read('dark')

  expect(light.pillColor, 'badge text must be theme-dependent').not.toEqual(dark.pillColor)
  expect(light.pillBackground, 'badge fill must be theme-dependent').not.toEqual(dark.pillBackground)
  // The badge fill must be opaque; a translucent fill would make the tested
  // pair depend on whatever the badge happens to be sitting on.
  expect(light.pillBackground, 'badge fill must be opaque').not.toMatch(/rgba?\([^)]*,\s*0?\.\d+\)/)

  // Not conditional: a missing link element would silently skip the only check
  // that the new brand.link token reaches the browser at all.
  expect(light.linkColor, '/search rendered no .text-brand-link element (light)').toBeTruthy()
  expect(dark.linkColor, '/search rendered no .text-brand-link element (dark)').toBeTruthy()
  expect(light.linkColor, 'link colour must be theme-dependent').not.toEqual(dark.linkColor)
  expect(light.linkColor, 'the light-mode link must stay the brand blue').toBe('rgb(0, 102, 204)')
})
