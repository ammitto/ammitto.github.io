import { ViteSSG } from 'vite-ssg'
import App from './App.vue'
import { routes } from './router'
import './assets/styles/main.css'

// Scroll to top on page navigation
const scrollBehavior = () => {
  window.scrollTo(0, 0)
}

// https://github.com/antfu/vite-ssg
export const createApp = ViteSSG(
  App,
  { routes, scrollBehavior },
  ({ app: _app, router: _router, routes: _routes, isClient: _isClient, initialState: _initialState }) => {
    // Install plugins, configure app, etc.
    // On client side, you can access initial state from `initialState`
  }
)
