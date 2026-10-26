import { defineConfig } from 'astro/config'
import vue from '@astrojs/vue'
import tailwindcss from '@tailwindcss/vite'
import sharedVite from './vite.config.ts'
import captureBuildAssets from './scripts/capture-build-assets.mjs'
import browserRouteCoverage from './scripts/verify-astro-routes.mjs'

export default defineConfig({
  site: 'https://www.ammitto.org',
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [vue(), browserRouteCoverage()],
  build: { format: 'directory', assets: 'assets' },
  vite: { ...sharedVite, plugins: [...sharedVite.plugins, tailwindcss(), captureBuildAssets()] },
})
