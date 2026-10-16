import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { CONTRAST_SCAN_ROUTES } from '../routes.js'
import { collectPageErrors, gotoRendered as gotoRenderedBase, serveSourceGraphs, useTheme } from './helpers.js'

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
async function gotoRendered(page, path) {
  await gotoRenderedBase(page, path)
}

const ALLOWED_INCOMPLETE = [
  {
    routes: ['/ontology'],
    reason: /bgOverlap|background color could not be determined because it is overlapped/i,
    within: '.ontology-graph svg[aria-label="Ontology class graph"]',
    is: '.graph-node > text',
    element: 'OntologyGraph.vue — each SVG class label painted over its own preceding rectangle',
    why:
      'axe reports bgOverlap for these SVG labels instead of resolving their ' +
      'painted background; the direct measurement verifies their own rectangle.',
    measuredBy:
      'assertGraphNodeContrast in this file measures every rendered text fill ' +
      'against its own opaque rectangle fill with axe color helpers, at 4.5:1 ' +
      'in both themes and default/focus/selected states. It also requires text ' +
      'containment, hit-test ownership and rejects foreign or node overlap, opacity, ' +
      'filters or blending. The negative fixture below proves these failures.',
  },
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

const GRAPH_NODES = '.ontology-graph svg[aria-label="Ontology class graph"] .graph-node'

/** Resolve the SVG pair directly; axe's background inference cannot do this. */
async function readGraphNodeContrast(page, exerciseStates = false) {
  return page.locator(GRAPH_NODES).evaluateAll(async (nodes, exerciseStates) => {
    const { Color, getContrast } = window.axe.commons.color
    const measure = (node, state) => {
      const texts = node.querySelectorAll(':scope > text')
      const rects = node.querySelectorAll(':scope > rect')
      if (texts.length !== 1 || rects.length !== 1) {
        throw new Error('each graph node must have exactly one direct text and rectangle')
      }
      const text = texts[0]
      const rect = rects[0]
      const foreground = getComputedStyle(text).fill
      const background = getComputedStyle(rect).fill
      const fg = new Color().parseString(foreground)
      const bg = new Color().parseString(background)
      const a = text.getBoundingClientRect()
      const b = rect.getBoundingClientRect()
      const ancestors = [text, rect]
      for (let el = node; el; el = el.parentElement) ancestors.push(el)
      const opaque = fg.alpha === 1 && bg.alpha === 1 && ancestors.every(el => {
        const style = getComputedStyle(el)
        return Number(style.opacity) === 1 && Number(style.fillOpacity) === 1 &&
          style.filter === 'none' && style.mixBlendMode === 'normal'
      })
      const overlaps = nodes.some(other => {
        if (other === node) return false
        const otherRect = other.querySelector(':scope > rect').getBoundingClientRect()
        return a.left < otherRect.right && a.right > otherRect.left &&
          a.top < otherRect.bottom && a.bottom > otherRect.top
      })
      // Text has pointer-events:none, so its painted backdrop must own the
      // hit-test at the centre and corners. Reject unrelated SVG/HTML covers.
      const points = [
        [(a.left + a.right) / 2, (a.top + a.bottom) / 2],
        [a.left + 0.5, a.top + 0.5], [a.right - 0.5, a.top + 0.5],
        [a.left + 0.5, a.bottom - 0.5], [a.right - 0.5, a.bottom - 0.5],
      ]
      // Native hit-testing ignores pointer-events:none even when an element
      // paints over the label. Temporarily include those layers, preserving
      // inline values/priorities (including !important), then restore them.
      const passThrough = [...document.querySelectorAll('body *')]
        .filter(el => getComputedStyle(el).pointerEvents === 'none')
        .map(el => [el, el.style.getPropertyValue('pointer-events'), el.style.getPropertyPriority('pointer-events')])
      let blockers
      try {
        for (const [el] of passThrough) el.style.setProperty('pointer-events', 'all', 'important')
        blockers = points.flatMap(([x, y]) => {
          const hit = document.elementFromPoint(x, y)
          return hit === rect || hit === text ? [] : [{ x, y, element: hit?.tagName || 'outside viewport', id: hit?.id || '' }]
        })
      } finally {
        for (const [el, value, priority] of passThrough) {
          if (value) el.style.setProperty('pointer-events', value, priority)
          else el.style.removeProperty('pointer-events')
        }
      }
      const unobscured = blockers.length === 0
      return {
        label: text.textContent, state, foreground, background, unobscured, blockers,
        ratio: getContrast(bg, fg), opaque, overlaps,
        contained: a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom,
        rectBeforeText: Boolean(rect.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING),
        focused: !state.includes('focus') || (document.activeElement === node && node.matches(':focus-visible')),
        selected: !state.includes('selected') || node.getAttribute('aria-pressed') === 'true',
      }
    }
    const settled = node => {
      node.querySelector(':scope > text').scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' })
      return new Promise(resolve => requestAnimationFrame(resolve))
    }
    const samples = []
    for (const node of nodes) {
      await settled(node)
      samples.push(measure(node, 'default'))
    }
    if (exerciseStates) {
      for (const node of nodes) {
        node.focus()
        await settled(node)
        samples.push(measure(node, 'focus'))
        node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        await settled(node)
        samples.push(measure(node, 'selected focus'))
        node.ownerSVGElement.focus()
        await settled(node)
        samples.push(measure(node, 'selected'))
      }
    }
    return samples
  }, exerciseStates)
}

const graphContrastFailures = samples => samples.filter(sample =>
  !(sample.ratio >= 4.5) || !sample.opaque || sample.overlaps || !sample.contained ||
  !sample.rectBeforeText || !sample.unobscured || !sample.focused || !sample.selected,
)

async function assertGraphNodeContrast(page, theme) {
  await expect(page.locator('.ontology-graph svg[data-ready="true"]')).toBeVisible()
  // Put the browser in keyboard focus mode before exercising :focus-visible.
  await page.keyboard.press('Tab')
  const samples = await readGraphNodeContrast(page, true)
  expect(samples.length, 'no SVG class text was measured').toBeGreaterThan(0)
  expect(graphContrastFailures(samples), `rendered SVG contrast (${theme})`).toEqual([])
  test.info().annotations.push({
    type: 'svg-contrast',
    description: `${theme}: ${samples.length} rendered state pairs, minimum ${Math.min(...samples.map(sample => sample.ratio)).toFixed(2)}:1`,
  })
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

      if (route.path === '/ontology') await assertGraphNodeContrast(page, theme)

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
    await gotoRendered(page, '/api')
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

test('SVG contrast allowance is scoped and its rendered measurement rejects unreadable or obscured labels', async ({ page }) => {
  await useTheme(page, 'light')
  await gotoRendered(page, '/ontology')
  await expect(page.locator('.ontology-graph svg[data-ready="true"]')).toBeVisible()
  await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
  const overlap = { failureSummary: 'bgOverlap background color could not be determined because it is overlapped' }
  const target = `${GRAPH_NODES}[aria-label="View Entity class"] > text`
  await expect(isAllowedIncomplete(page, '/ontology', { ...overlap, target: [target] })).resolves.toBe(true)
  await expect(isAllowedIncomplete(page, '/', { ...overlap, target: [target] })).resolves.toBe(false)
  await expect(isAllowedIncomplete(page, '/ontology', { failureSummary: 'nonBmp only non-text characters', target: [target] })).resolves.toBe(false)
  await page.evaluate(() => {
    const ns = 'http://www.w3.org/2000/svg'
    const unrelated = document.createElementNS(ns, 'text')
    unrelated.id = 'unrelated-graph-text'
    document.querySelector('.ontology-graph svg').appendChild(unrelated)
    const elsewhere = document.createElementNS(ns, 'svg')
    const node = document.createElementNS(ns, 'g')
    node.classList.add('graph-node')
    const text = document.createElementNS(ns, 'text')
    text.id = 'outside-graph-text'
    node.appendChild(text)
    elsewhere.appendChild(node)
    document.body.appendChild(elsewhere)
  })
  for (const selector of ['#unrelated-graph-text', '#outside-graph-text']) {
    await expect(isAllowedIncomplete(page, '/ontology', { ...overlap, target: [selector] })).resolves.toBe(false)
  }
  expect(graphContrastFailures(await readGraphNodeContrast(page))).toEqual([])
  const first = page.locator(GRAPH_NODES).first()
  await first.evaluate(async node => {
    const text = node.querySelector('text')
    text.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' })
    await new Promise(resolve => requestAnimationFrame(resolve))
    const bounds = text.getBoundingClientRect()
    const cover = document.createElement('div')
    cover.id = 'foreign-graph-cover'
    Object.assign(cover.style, {
      position: 'fixed', left: `${bounds.left}px`, top: `${bounds.top}px`,
      width: `${bounds.width}px`, height: `${bounds.height}px`,
      background: 'white', zIndex: '2147483647',
    })
    document.body.appendChild(cover)
  })
  expect(graphContrastFailures(await readGraphNodeContrast(page)).some(sample => !sample.unobscured)).toBe(true)
  await page.locator('#foreign-graph-cover').evaluate(cover => { cover.style.setProperty('pointer-events', 'none', 'important') })
  expect(graphContrastFailures(await readGraphNodeContrast(page)).some(sample => !sample.unobscured)).toBe(true)
  await expect(page.locator('#foreign-graph-cover')).toHaveCSS('pointer-events', 'none')
  expect(await page.locator('#foreign-graph-cover').evaluate(cover => cover.style.getPropertyPriority('pointer-events'))).toBe('important')
  await page.locator('#foreign-graph-cover').evaluate(cover => cover.remove())
  await first.evaluate(node => node.appendChild(node.querySelector('text').cloneNode(true)))
  await expect(readGraphNodeContrast(page)).rejects.toThrow('exactly one direct text and rectangle')
  await first.locator(':scope > text').last().evaluate(text => text.remove())
  await first.evaluate(node => node.appendChild(node.querySelector('rect').cloneNode(true)))
  await expect(readGraphNodeContrast(page)).rejects.toThrow('exactly one direct text and rectangle')
  await first.locator(':scope > rect').last().evaluate(rect => rect.remove())
  await first.evaluate(node => { node.querySelector('text').style.fill = getComputedStyle(node.querySelector('rect')).fill })
  expect(graphContrastFailures(await readGraphNodeContrast(page)).some(sample => sample.ratio === 1)).toBe(true)
  await first.evaluate(node => { node.querySelector('text').style.removeProperty('fill'); node.style.opacity = '0.5' })
  expect(graphContrastFailures(await readGraphNodeContrast(page)).some(sample => !sample.opaque)).toBe(true)
  await first.evaluate(node => node.style.removeProperty('opacity'))
  await page.locator(GRAPH_NODES).nth(1).evaluate(node => { node.setAttribute('transform', node.parentElement.querySelector('.graph-node').getAttribute('transform')) })
  expect(graphContrastFailures(await readGraphNodeContrast(page)).some(sample => sample.overlaps)).toBe(true)
})
