import { writeFileSync } from 'node:fs'
import { STATIC_ROUTES } from '../tests/routes.js'

export const STATIC_ROUTE_MANIFEST = 'ammitto-static-routes.json'

const canonical = path => `/${path.replace(/^\/+|\/+$/g, '')}`

/** The actual prerendered Astro paths, rather than the retired SPA catalogue. */
export function verifyRouteCoverage(pages, fixtures = STATIC_ROUTES) {
  const actual = new Set(pages.map(page => canonical(page.pathname)).filter(path => path !== '/404'))
  const covered = new Set(fixtures.map(page => canonical(page.path)))
  const missing = [...actual].filter(path => !covered.has(path))
  const stale = [...covered].filter(path => !actual.has(path))
  if (missing.length || stale.length) {
    throw new Error(`Astro/browser route coverage mismatch: uncovered [${missing.join(', ')}]; not built [${stale.join(', ')}]`)
  }
}

export default function browserRouteCoverage() {
  return {
    name: 'ammitto-browser-route-coverage',
    hooks: {
      'astro:build:done': ({ pages, dir }) => {
        verifyRouteCoverage(pages)
        const routes = pages.map(page => canonical(page.pathname))
          .filter(path => path !== '/404').map(path => path === '/' ? '/' : `${path}/`).sort()
        writeFileSync(new URL(STATIC_ROUTE_MANIFEST, dir), JSON.stringify({ version: 1, routes }) + '\n')
      },
    },
  }
}
