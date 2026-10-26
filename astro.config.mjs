import { defineConfig } from 'astro/config'
import vue from '@astrojs/vue'
import tailwindcss from '@tailwindcss/vite'
import sharedVite from './vite.config.ts'
import captureBuildAssets from './scripts/capture-build-assets.mjs'

export default defineConfig({
  site: 'https://www.ammitto.org',
  output: 'static',
  trailingSlash: 'never',
  integrations: [vue()],
  build: { format: 'file', assets: 'assets' },
  vite: { ...sharedVite, plugins: [...sharedVite.plugins, tailwindcss(), captureBuildAssets()] },
})
