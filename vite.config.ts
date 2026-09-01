import type { UserConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import type { ViteSSGOptions } from 'vite-ssg'
import { copyFileSync, existsSync, readdirSync, statSync, writeFileSync } from 'fs'
import { resolve, join, relative, sep } from 'path'

/** The origin the published IRIs are rooted at; also what a crawler is told. */
const SITE_ORIGIN = 'https://www.ammitto.org'

/**
 * Every route vite-ssg actually pre-rendered, as site-absolute paths.
 *
 * Walked out of `dist` rather than listed by hand, so the sitemap cannot name
 * a route that was not built. `404.html` is excluded: it is the SPA fallback,
 * not a page.
 */
function prerenderedRoutes(dist: string): string[] {
  const out: string[] = []

  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) {
        if (name === 'assets' || name === 'api' || name === 'schemas') continue
        walk(full)
        continue
      }
      if (!name.endsWith('.html') || name === '404.html') continue

      const rel = relative(dist, full).split(sep).join('/')
      out.push(rel === 'index.html' ? '/' : `/${rel.replace(/\.html$/, '')}`)
    }
  }

  walk(dist)
  return out.sort()
}

// vite-ssg reads its options off the same config object but does not
// augment vite's `UserConfig`, so the key has to be declared here rather
// than reached through `defineConfig`.
const config: UserConfig & { ssgOptions: Partial<ViteSSGOptions> } = {
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  // vite-ssg pre-renders the static routes only. Six route families are
  // dynamic — entity, announcement, group, legal-instrument,
  // document-type and organization — so nothing is emitted for any of
  // them, and GitHub Pages answered every one of those URLs with its own
  // 404 page. Clicking through the site worked, because that is the
  // router; sharing a link, bookmarking one or reloading did not.
  //
  // Pre-rendering them is not the answer at this corpus size: entities
  // alone are tens of thousands of pages. GitHub Pages serves 404.html
  // for any unmatched path, so shipping the app shell under that name
  // hands the URL back to the router, which already resolves it.
  ssgOptions: {
    onFinished() {
      const dist = resolve(__dirname, 'dist')
      const index = resolve(dist, 'index.html')
      if (!existsSync(index)) {
        throw new Error('dist/index.html missing; cannot create the SPA fallback')
      }
      copyFileSync(index, resolve(dist, '404.html'))

      // A sitemap of the pre-rendered routes ONLY, and robots.txt to point at
      // it. Neither existed: both /robots.txt and /sitemap.xml answered 404,
      // so nothing told a crawler this site had pages at all.
      //
      // The record routes are deliberately absent, and that is the whole care
      // in this function. Every `@id` the API publishes — for example
      // `https://www.ammitto.org/entity/uk/aqd0087` — resolves through the
      // 404.html fallback above, which GitHub Pages serves with an HTTP 404
      // status. The page renders, because that status carries the app shell
      // and the router takes over; but listing 61,099 URLs that answer 404 in
      // a sitemap would be submitting known-missing pages, which is worse than
      // submitting none. Fixing the status needs pre-rendering or a host that
      // can rewrite, and neither is a build-config change.
      // Escaped even though no route needs it today: all 18 are plain ASCII
      // paths. A future route carrying an `&` would otherwise emit invalid
      // XML, and a malformed sitemap fails at the crawler rather than at the
      // build — silently, and only for the thing the file exists to do.
      const xmlEscape = (value: string): string =>
        value.replace(/[&<>"']/g, (c) =>
          ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c] as string))

      const routes = prerenderedRoutes(dist)
      const urls = routes
        .map((route) => `  <url><loc>${xmlEscape(SITE_ORIGIN + route)}</loc></url>`)
        .join('\n')

      writeFileSync(
        resolve(dist, 'sitemap.xml'),
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
          `${urls}\n` +
          '</urlset>\n',
      )

      writeFileSync(
        resolve(dist, 'robots.txt'),
        'User-agent: *\n' +
          'Allow: /\n' +
          `Sitemap: ${SITE_ORIGIN}/sitemap.xml\n`,
      )
    },
  },
}

export default config
