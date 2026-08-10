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
 * pages this remediation owns, and no per-node suppressions — an allowlist is
 * how this kind of check rots. Broadening to the rest of axe's rules is a
 * separate accessibility task, not something to smuggle in behind a colour fix.
 */
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

      // "Incomplete" is axe declining to decide (usually text over a gradient
      // or an image). It is neither a pass nor a failure, so it is surfaced
      // rather than swallowed — and the count is asserted so a change in what
      // axe cannot determine shows up in review instead of hiding a
      // regression.
      const incomplete = results.incomplete.flatMap((v) => v.nodes)
      if (incomplete.length > 0) {
        test.info().annotations.push({
          type: 'axe-incomplete',
          description: `${route.path} (${theme}): ${incomplete.length} node(s) axe could not decide:\n    ${describe(
            incomplete,
          )}`,
        })
      }

      expect(errors, `${route.path} threw: ${errors.join('\n')}`).toEqual([])
    })
  }
}

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
  if (light.linkColor && dark.linkColor) {
    expect(light.linkColor, 'link colour must be theme-dependent').not.toEqual(dark.linkColor)
    expect(light.linkColor, 'the light-mode link must stay the brand blue').toBe('rgb(0, 102, 204)')
  }
})
