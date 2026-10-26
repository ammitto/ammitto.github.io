import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createRenderer, createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { navigationHref, onBeforeRouteLeave, useRoute, useRouter } from '../.test-build/utils/navigation.js'

// A browser URL/history double: test the shipped navigation module, including
// its reactive route state and installed history-event handlers.
const listeners = new Map()
const calls = []
let address = new URL('https://www.ammitto.org/search')
const browser = {
  location: {
    get href() { return address.href },
    get pathname() { return address.pathname },
    get origin() { return address.origin },
    assign(url) { calls.push(['assign', url]) },
    replace(url) { calls.push(['replace', url]) },
  },
  history: {
    state: {},
    pushState(state, _unused, url) { this.state = state; address = new URL(url, address); calls.push(['push', url]) },
    replaceState(state, _unused, url) { this.state = state; address = new URL(url, address); calls.push(['replaceState', url]) },
  },
  addEventListener(name, callback) { listeners.set(name, callback) },
  removeEventListener(name, callback) { if (listeners.get(name) === callback) listeners.delete(name) },
}

const renderer = createRenderer({
  patchProp() {}, insert() {}, remove() {}, createElement() { return {} },
  createText() { return {} }, createComment() { return {} }, setText() {},
  setElementText() {}, parentNode() { return null }, nextSibling() { return null },
})

beforeEach(() => {
  globalThis.window = browser
  address = new URL('https://www.ammitto.org/search')
  browser.history.state = {}
  calls.length = 0
  listeners.get('popstate')?.()
})

async function routeState() {
  let route
  const app = createSSRApp({ setup() { route = useRoute(); return () => null } })
  await renderToString(app)
  return route
}

test('native hrefs serialize source filters and omit removed values', () => {
  assert.equal(navigationHref({ name: 'search', query: { q: 'A & B', source: ['cn', 'uk'], type: undefined } }),
    '/search?q=A+%26+B&source=cn&source=uk')
  assert.equal(navigationHref({ name: 'search' }), '/search')
})

test('same-page push and replace update reactive query state without a page load', async () => {
  const route = await routeState()
  const router = useRouter()
  browser.history.state = { ammittoSearchReturn: true }
  await router.replace({ query: { source: ['cn', 'uk'], page: '2' } })
  assert.equal(route.path, '/search')
  assert.deepEqual([...route.query.source], ['cn', 'uk'])
  assert.equal(browser.history.state.ammittoSearchReturn, true)
  await router.push({ query: { q: 'test', source: undefined }, hash: '#results' })
  assert.equal(route.fullPath, '/search?q=test#results')
  assert.equal(route.query.source, undefined)
  assert.equal(route.query.q, 'test')
  assert.equal(browser.history.state.ammittoSearchReturn, undefined)
  assert.deepEqual(calls.map(call => call[0]), ['replaceState', 'push'])
})

test('back/forward and hash changes refresh all islands through shared state', async () => {
  const route = await routeState()
  useRouter()
  address = new URL('https://www.ammitto.org/search?source=cn&source=ca#results')
  listeners.get('popstate')()
  assert.deepEqual([...route.query.source], ['cn', 'ca'])
  assert.equal(route.hash, '#results')
  address.hash = '#filters'
  listeners.get('hashchange')()
  assert.equal(route.hash, '#filters')
})

test('cross-page navigation loads an Astro document rather than swapping a root app', async () => {
  const router = useRouter()
  await router.push({ path: '/entity/cn/record' })
  await router.replace({ path: '/about' })
  assert.deepEqual(calls, [['assign', '/entity/cn/record'], ['replace', '/about']])
  assert.equal(browser.location.pathname, '/search')
})

test('detail IDs preserve path segments and decode escaped source identifiers', () => {
  const router = useRouter()
  const detail = router.resolve('/entity/cn/some%20record')
  assert.equal(detail.name, 'entity')
  assert.equal(detail.params.id, 'cn/some record')
  assert.equal(detail.path, '/entity/cn/some%20record')
  assert.equal(router.resolve('/group/cn/%E0%A4%A').params.id, 'cn/%E0%A4%A')
})

test('query bookmarks apply after hydration while the independently mounted header stays query-neutral', () => {
  address = new URL('https://www.ammitto.org/search?q=bookmarked&source=cn')
  let header, page, initialQuery
  const app = renderer.createApp({ setup() {
    header = useRoute('/search')
    page = useRoute()
    initialQuery = page.query.q
    return () => null
  } })
  app.mount({})
  assert.equal(initialQuery, undefined, 'initial markup matches static HTML')
  assert.equal(page.query.q, 'bookmarked', 'mount applies the real URL')
  assert.equal(page.query.source, 'cn')
  assert.equal(header.query.q, undefined, 'header does not hydrate query-dependent page state')
  app.unmount()
})

test('normal same-tab entity links notify search-return handling; new-tab and external links do not', () => {
  const documentListeners = new Map()
  globalThis.document = {
    addEventListener(name, callback) { documentListeners.set(name, callback) },
    removeEventListener(name) { documentListeners.delete(name) },
  }
  const destinations = []
  const app = renderer.createApp({ setup() { onBeforeRouteLeave(to => destinations.push(to)); return () => null } })
  app.mount({})
  const click = documentListeners.get('click')
  const event = (href, extra = {}) => ({ button: 0,
    target: { closest() { return { href, target: '', hasAttribute() { return false } } } }, ...extra })
  click(event('https://www.ammitto.org/entity/cn/record'))
  click(event('https://www.ammitto.org/entity/cn/other', { ctrlKey: true }))
  click(event('https://example.com/entity/cn/record'))
  assert.equal(destinations.length, 1)
  assert.equal(destinations[0].name, 'entity')
  assert.equal(destinations[0].params.id, 'cn/record')
  app.unmount()
  assert.equal(documentListeners.has('click'), false)
  delete globalThis.document
})

test('server rendering uses request-local pathname and cannot mutate browser history', async () => {
  delete globalThis.window
  let route
  await renderToString(createSSRApp({ setup() { route = useRoute('/browse/entities'); return () => null } }))
  assert.equal(route.path, '/browse/entities')
  assert.equal(route.name, 'browse-entities')
  assert.equal(navigationHref({ name: 'search', query: { source: 'cn' } }), '/search?source=cn')
  await useRouter().push('/about')
  assert.deepEqual(calls, [])
})
