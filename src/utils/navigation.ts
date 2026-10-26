import { onBeforeUnmount, onMounted, reactive } from 'vue'
import { DETAIL_ROUTE_TITLES } from './detailRoutes.js'

/** URL state for independently hydrated Vue islands. Astro owns page routing. */
export type LocationQueryValue = string | null
type Query = Record<string, LocationQueryValue | LocationQueryValue[] | undefined>
type QueryInput = Record<string, string | number | null | undefined | (string | number | null)[]>
type Destination = string | { path?: string; name?: string; query?: QueryInput; hash?: string }
type Route = { path: string; fullPath: string; name: string; params: { id?: string }; query: Query; hash: string }

const routePaths: Record<string, string> = {
  home: '/', search: '/search', ontology: '/ontology', browse: '/browse', api: '/api',
  download: '/download', about: '/about', ruby: '/ruby', schema: '/schema',
  sources: '/sources', license: '/license',
}
const detailNames = new Set(Object.keys(DETAIL_ROUTE_TITLES))
const BASE = 'https://www.ammitto.org'

function readRoute(address: string): Route {
  const url = new URL(address, BASE)
  const query: Query = {}
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key)
    query[key] = values.length > 1 ? values : values[0]
  }
  const path = url.pathname
  const normalized = path.replace(/\/$/, '') || '/'
  const match = /^\/([^/]+)\/(.+)$/.exec(normalized)
  let id: string | undefined
  if (match && detailNames.has(match[1])) {
    try { id = decodeURIComponent(match[2]) } catch { id = match[2] }
  }
  const name = id ? match![1] : Object.keys(routePaths).find(key => routePaths[key] === normalized)
    ?? (normalized.startsWith('/browse/') ? normalized.slice(1).replace(/\//g, '-') : 'not-found')
  return { path, fullPath: path + url.search + url.hash, name, params: { id }, query, hash: url.hash }
}

let browserRoute: Route | undefined
function currentRoute(): Route {
  if (typeof window === 'undefined') return readRoute('/')
  if (!browserRoute) {
    // Static HTML has no request query string. Hydrate that neutral state
    // first, then apply query/hash on mount so bookmarked filters do not
    // cause server/client markup mismatches or get canonicalized away.
    browserRoute = reactive(readRoute(window.location.pathname))
    const sync = () => Object.assign(browserRoute!, readRoute(window.location.href))
    window.addEventListener('popstate', sync)
    window.addEventListener('hashchange', sync)
  }
  return browserRoute
}

/** A pathname prop gives server-rendered navigation its request-local context. */
export function useRoute(pathname?: string): Route {
  // The header hydrates independently and must not apply query state before
  // a page island hydrates its query-neutral static HTML.
  if (pathname !== undefined) {
    const route = reactive(readRoute(pathname))
    const syncPath = () => Object.assign(route, readRoute(window.location.pathname))
    onMounted(() => {
      syncPath()
      window.addEventListener('popstate', syncPath)
    })
    onBeforeUnmount(() => {
      if (typeof window !== 'undefined') window.removeEventListener('popstate', syncPath)
    })
    return route
  }
  if (typeof window === 'undefined') return reactive(readRoute(pathname || '/'))
  const route = currentRoute()
  onMounted(() => Object.assign(route, readRoute(window.location.href)))
  return route
}

function resolve(target: Destination): Route {
  const current = currentRoute()
  if (typeof target === 'string') return readRoute(new URL(target, BASE + current.fullPath).href)
  const path = target.path ?? (target.name ? routePaths[target.name] : undefined) ?? current.path
  const url = new URL(path, BASE)
  if (target.query) {
    url.search = ''
    for (const [key, value] of Object.entries(target.query)) {
      for (const item of Array.isArray(value) ? value : [value]) {
        if (item !== undefined) url.searchParams.append(key, item === null ? '' : String(item))
      }
    }
  }
  url.hash = target.hash || ''
  return readRoute(url.href)
}

export function navigationHref(target: Destination): string { return resolve(target).fullPath }

const leaveCallbacks = new Set<(to: Route) => void>()
async function navigate(target: Destination, replace: boolean): Promise<void> {
  if (typeof window === 'undefined') return
  const destination = resolve(target)
  if (destination.path !== window.location.pathname) {
    for (const callback of leaveCallbacks) callback(destination)
    if (replace) window.location.replace(destination.fullPath)
    else window.location.assign(destination.fullPath)
    return
  }
  if (replace) window.history.replaceState(window.history.state, '', destination.fullPath)
  else window.history.pushState({}, '', destination.fullPath)
  Object.assign(currentRoute(), destination)
}

export function useRouter() {
  return { resolve, push: (to: Destination) => navigate(to, false), replace: (to: Destination) => navigate(to, true) }
}

/** Preserve search-return state before following a normal, same-tab anchor. */
export function onBeforeRouteLeave(callback: (to: Route) => void) {
  const click = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]')
    if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return
    const url = new URL(anchor.href, window.location.href)
    if (url.origin === window.location.origin && url.pathname !== window.location.pathname) callback(readRoute(url.href))
  }
  onMounted(() => {
    leaveCallbacks.add(callback)
    document.addEventListener('click', click)
  })
  onBeforeUnmount(() => {
    leaveCallbacks.delete(callback)
    document.removeEventListener('click', click)
  })
}
