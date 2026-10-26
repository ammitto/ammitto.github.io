import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateServiceWorker } from './generate-service-worker.js'
import { STATIC_ROUTE_MANIFEST } from './verify-astro-routes.mjs'

const SITE_ORIGIN = 'https://www.ammitto.org'

/** Use Astro's actual outputs; a filesystem crawl can mistake API HTML for pages. */
export function prerenderedRoutes(dist) {
  const manifest = JSON.parse(readFileSync(resolve(dist, STATIC_ROUTE_MANIFEST), 'utf8'))
  if (manifest.version !== 1 || !Array.isArray(manifest.routes) || !manifest.routes.length ||
      manifest.routes.some(path => typeof path !== 'string' || !path.startsWith('/') ||
        path.startsWith('//') || !path.endsWith('/') || /[?#]/.test(path))) {
    throw new Error('Invalid Astro static route manifest')
  }
  const routes = [...new Set(manifest.routes)].filter(path => path !== '/404/').sort()
  if (!routes.includes('/')) throw new Error('Astro static route manifest is missing the homepage')
  return routes
}

export function verifyDetailFallback(dist) {
  const index = resolve(dist, 'index.html')
  const fallback = resolve(dist, '404.html')
  if (!existsSync(index) || !existsSync(fallback)) {
    throw new Error('Astro must emit dist/index.html and dist/404.html')
  }
  const html = readFileSync(fallback, 'utf8')
  if (!html.includes('data-detail-fallback') || !html.includes('astro-island')) {
    throw new Error('dist/404.html must contain the hydrated detail dispatcher')
  }
}

export function finalizeAstroBuild(dist) {
  verifyDetailFallback(dist)
  const xmlEscape = value => value.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]))
  const routes = prerenderedRoutes(dist)
  const urls = routes.map(route => `  <url><loc>${xmlEscape(SITE_ORIGIN + route)}</loc></url>`).join('\n')
  writeFileSync(resolve(dist, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    `${urls}\n</urlset>\n`)
  writeFileSync(resolve(dist, 'robots.txt'),
    `User-agent: *\nAllow: /\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`)
  const worker = generateServiceWorker(dist)
  console.log(`Astro publication: ${routes.length} sitemap routes; ${worker.assets.length} bounded static cache assets`)
  return { routes, worker }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  finalizeAstroBuild(resolve(process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '../dist')))
}
