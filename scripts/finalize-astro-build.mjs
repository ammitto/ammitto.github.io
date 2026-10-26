import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateServiceWorker } from './generate-service-worker.js'

const SITE_ORIGIN = 'https://www.ammitto.org'

/** Only pages actually emitted by Astro belong in the sitemap. */
export function prerenderedRoutes(dist) {
  const out = []
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) {
        if (['assets', 'api', 'schemas', '.vite', 'search-runtime'].includes(name)) continue
        walk(full)
        continue
      }
      if (!name.endsWith('.html') || name === '404.html') continue
      const rel = relative(dist, full).split(sep).join('/')
      out.push(rel === 'index.html' ? '/' : `/${rel.replace(/(?:\/index)?\.html$/, '')}`)
    }
  }
  walk(dist)
  return out.sort()
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
