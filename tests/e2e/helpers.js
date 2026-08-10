import { expect } from '@playwright/test'

/**
 * Pin the theme before any application code runs. `index.html` reads
 * localStorage in a blocking script and puts `.dark` on <html> before CSS is
 * applied, so setting the key in an init script is exactly the path a returning
 * visitor takes — and it avoids depending on the OS colour-scheme of whatever
 * machine runs the suite.
 */
export async function useTheme(page, theme) {
  await page.addInitScript((value) => {
    window.localStorage.setItem('theme', value)
  }, theme)
}

/**
 * Serve the per-source aggregate that /browse/entities reads.
 *
 * The snapshot committed under `public/api/v1` has no `sources/` directory —
 * the harmonize step in the deploy workflow produces it — so that page renders
 * an empty list in a plain checkout and there would be nothing to scan. The
 * fixture is not invented: it is the repository's own `all.jsonld`, whose
 * `@graph` is exactly what `sources/<code>.jsonld` carries, so it cannot drift
 * from the producer's schema. Sources with no data answer with an empty graph,
 * which is what the page must tolerate anyway.
 */
export async function serveSourceGraphs(page, request, { source = 'cn' } = {}) {
  const response = await request.get('/api/v1/all.jsonld')
  expect(response.ok(), 'the committed aggregate must be servable').toBeTruthy()
  const aggregate = await response.json()
  expect(Array.isArray(aggregate['@graph'])).toBeTruthy()
  const body = JSON.stringify({ '@graph': aggregate['@graph'] })

  await page.route('**/api/v1/sources/*.jsonld', (route) => {
    const isTarget = route.request().url().endsWith(`/${source}.jsonld`)
    return route.fulfill({
      status: 200,
      contentType: 'application/ld+json',
      body: isTarget ? body : JSON.stringify({ '@graph': [] }),
    })
  })
}

/** Fail loudly on anything the page throws, rather than measuring a broken render. */
export function collectPageErrors(page) {
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  return errors
}

/**
 * Navigate and wait for the client-side render to settle. The pages are
 * prerendered by vite-ssg but hydrate and then fetch their data, so a
 * `load` event alone proves nothing about what is on screen.
 */
export async function gotoRendered(page, path) {
  const response = await page.goto(path, { waitUntil: 'networkidle' })
  if (response) {
    expect(response.status(), `${path} returned HTTP ${response.status()}`).toBeLessThan(400)
  }
  await page.waitForFunction(() => document.fonts.ready.then(() => true))
  await expect(page.locator('#app')).toBeVisible()
}

/**
 * Assert the document does not scroll horizontally, and if it does, report the
 * widest offending elements instead of a bare boolean.
 */
export async function expectNoHorizontalOverflow(page, label) {
  const report = await page.evaluate(() => {
    const doc = document.documentElement
    const limit = doc.clientWidth
    const overflowing =
      doc.scrollWidth > limit + 1 || (document.body && document.body.scrollWidth > limit + 1)
    const offenders = []
    if (overflowing) {
      for (const el of document.querySelectorAll('body *')) {
        const rect = el.getBoundingClientRect()
        const style = getComputedStyle(el)
        // Two distinct failure shapes: a box that is itself too wide, and a
        // box of the right width whose inline content (a long unbroken URL,
        // say) spills out with overflow:visible. The second one has a
        // perfectly ordinary bounding rect, so rect checks alone miss it and
        // the failure message would name no culprit at all.
        const boxTooWide = rect.width > 0 && (rect.right > limit + 2 || rect.left < -2)
        const contentSpills =
          style.overflowX === 'visible' && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0
        if (boxTooWide || contentSpills) {
          offenders.push({
            selector:
              el.tagName.toLowerCase() +
              (el.classList.length ? '.' + [...el.classList].slice(0, 3).join('.') : ''),
            reason: boxTooWide ? 'box wider than the viewport' : 'content spills past the box',
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
            text: (el.textContent || '').trim().slice(0, 60),
          })
        }
        if (offenders.length >= 8) break
      }
    }
    return {
      scrollWidth: doc.scrollWidth,
      bodyScrollWidth: document.body ? document.body.scrollWidth : 0,
      clientWidth: limit,
      offenders,
    }
  })

  expect(
    report.scrollWidth,
    `${label}: document scrolls horizontally (scrollWidth ${report.scrollWidth} vs clientWidth ${
      report.clientWidth
    }). Widest offenders: ${JSON.stringify(report.offenders, null, 2)}`,
  ).toBeLessThanOrEqual(report.clientWidth + 1)

  expect(
    report.bodyScrollWidth,
    `${label}: <body> scrolls horizontally (${report.bodyScrollWidth} vs ${report.clientWidth})`,
  ).toBeLessThanOrEqual(report.clientWidth + 1)
}
