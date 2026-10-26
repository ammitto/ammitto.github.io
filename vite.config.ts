import type { Plugin, UserConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { LIVE_ORIGIN_ENV, createApiHandler, resolveLiveOrigin } from './scripts/dev-api-proxy.js'

function devApiData(): Plugin {
  return {
    name: 'ammitto-dev-api-data',
    apply: 'serve',
    configureServer(server) {
      const live = process.env.AMMITTO_DEV_DATA === 'live'
      const remoteOnly = process.env.AMMITTO_DEV_REMOTE_ONLY === '1'
      if (remoteOnly && !live) throw new Error('AMMITTO_DEV_REMOTE_ONLY=1 requires AMMITTO_DEV_DATA=live')
      const prefixes = remoteOnly ? ['/api/v1', '/search-runtime'] : ['/api/v1']
      for (const prefix of prefixes) {
        server.middlewares.use(prefix, createApiHandler({
          apiRoot: fileURLToPath(new URL(`./public${prefix}`, import.meta.url)),
          live,
          preferLocal: !remoteOnly,
          origin: live ? resolveLiveOrigin(process.env[LIVE_ORIGIN_ENV]) : undefined,
        }))
      }
    },
  }
}

export default {
  plugins: [devApiData()],
  build: { manifest: true },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
} satisfies UserConfig
