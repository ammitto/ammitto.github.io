import type { UserConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import type { ViteSSGOptions } from 'vite-ssg'
import { copyFileSync, existsSync } from 'fs'
import { resolve } from 'path'

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
      const index = resolve(__dirname, 'dist/index.html')
      if (!existsSync(index)) {
        throw new Error('dist/index.html missing; cannot create the SPA fallback')
      }
      copyFileSync(index, resolve(__dirname, 'dist/404.html'))
    },
  },
}

export default config
