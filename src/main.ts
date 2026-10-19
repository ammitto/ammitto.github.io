import { ViteSSG } from 'vite-ssg'
import { nextTick } from 'vue'
import type { RouterScrollBehavior } from 'vue-router'
import App from './App.vue'
import { routes } from './router'
import './assets/styles/main.css'
import { registerServiceWorker } from './utils/registerServiceWorker'

// Browser history retains its scroll position; same-page query changes do
// not interrupt reading. Search restores its originating virtual record once
// its index is available, because the browser cannot scroll into unmounted rows.
const scrollBehavior: RouterScrollBehavior = (to, from, savedPosition) => {
  if (savedPosition) return savedPosition
  if (to.hash) return { el: to.hash, top: 96 }
  if (to.path === from.path) return false
  return { left: 0, top: 0 }
}

// https://github.com/antfu/vite-ssg
export const createApp = ViteSSG(
  App,
  { routes, scrollBehavior },
  ({ app: _app, router: _router, routes: _routes, isClient, initialState: _initialState }) => {
    // Install plugins, configure app, etc.
    // On client side, you can access initial state from `initialState`
    if (isClient) {
      _router.afterEach((to, from) => {
        if (to.path !== from.path) nextTick(() => document.getElementById('main-content')?.focus({ preventScroll: true }))
      })
    }
    if (isClient && import.meta.env.PROD) registerServiceWorker(import.meta.env.BASE_URL)
  }
)
