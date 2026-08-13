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
 * Make sure /browse/entities has entities to render.
 *
 * If the build being tested carries a real `sources/` tree — which the deploy
 * workflow's harmonize produces — this does NOTHING and the page is exercised
 * against the deployed contract. It only steps in for a plain checkout, whose
 * committed `public/api/v1` snapshot has no `sources/` directory at all, so
 * the page would otherwise render an empty list and there would be nothing to
 * scan.
 *
 * Even then the fixture is not invented: it is the repository's own
 * `all.jsonld`, whose `@graph` is exactly what `sources/<code>.jsonld` carries.
 * It is still consumer-side interception, so it proves the page renders that
 * shape correctly — never that harmonize produced the endpoint.
 *
 * @returns true when interception was installed, false when the real files
 *          were used.
 */
async function hasRealSourceGraph(request, source) {
  const response = await request.get(`/api/v1/sources/${source}.jsonld`)
  if (!response.ok()) return false
  try {
    const body = await response.json()
    return Array.isArray(body['@graph']) && body['@graph'].length > 0
  } catch {
    return false
  }
}

export async function serveSourceGraphs(page, request, { source = 'cn' } = {}) {
  // A 200 is not proof the endpoint exists: a static preview server answers
  // unknown paths with the SPA's index.html. The response has to parse as the
  // graph the page expects before it counts as the real thing.
  if (await hasRealSourceGraph(request, source)) return false

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
  return true
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
  const response = await page.goto(path, { waitUntil: 'domcontentloaded' })
  if (response) {
    expect(response.status(), `${path} returned HTTP ${response.status()}`).toBeLessThan(400)
  }
  await expect(page.locator('#app')).toBeVisible()
  // Best-effort settle, deliberately not an assertion. Against the full
  // fifteen-source dataset some detail pages keep fetching related records for
  // far longer than any sane test budget, and "the network went quiet" was
  // never the thing worth proving anyway — every caller goes on to assert that
  // the content it cares about is actually on screen, which is.
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
  await page.waitForFunction(() => document.fonts.ready.then(() => true))
}

/**
 * Wait until the page's visible text contains `needle`, then return all of it.
 * Retrying matters: these pages prerender a shell and fill it in after their
 * data arrives, so a single innerText read is a race.
 */
export async function renderedText(page, needle, path) {
  await page
    .waitForFunction((text) => document.body.innerText.includes(text), needle, { timeout: 20000 })
    .catch(() => {})
  const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  expect(text, `${path} never rendered its expected content ("${needle}")`).toContain(needle)
  expect(text.length, `${path} rendered almost no text — the page did not load`).toBeGreaterThan(200)
  return text
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
