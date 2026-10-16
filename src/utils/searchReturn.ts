/** A tab-local reading position, never a URL supplied by another origin. */
export interface SearchReturnContext {
  path: string
  loadedCount: number
  scrollY: number
  offsetTop: number
  entityRef: string
  savedAt: number
}

const KEY = 'ammitto.search-return.v1'
const MAX_AGE = 24 * 60 * 60 * 1000
let fallback: SearchReturnContext | null = null

export function validSearchReturn(value: unknown, now = Date.now()): SearchReturnContext | null {
  if (!value || typeof value !== 'object') return null
  const context = value as Partial<SearchReturnContext>
  if (typeof context.path !== 'string' || !context.path.startsWith('/search')) return null
  try {
    const url = new URL(context.path, 'https://ammitto.invalid')
    if (url.origin !== 'https://ammitto.invalid' || url.pathname !== '/search' || url.hash) return null
  } catch { return null }
  if (typeof context.entityRef !== 'string' || !context.entityRef || context.entityRef.length > 2048) return null
  if (!Number.isInteger(context.loadedCount) || context.loadedCount! < 1 || context.loadedCount! > 100000) return null
  if (typeof context.scrollY !== 'number' || !Number.isFinite(context.scrollY) || context.scrollY < 0) return null
  if (typeof context.offsetTop !== 'number' || !Number.isFinite(context.offsetTop)) return null
  if (typeof context.savedAt !== 'number' || context.savedAt > now || now - context.savedAt > MAX_AGE) return null
  return context as SearchReturnContext
}

export function storeSearchReturn(context: Omit<SearchReturnContext, 'savedAt'>): void {
  const next = validSearchReturn({ ...context, savedAt: Date.now() })
  if (!next) return
  fallback = next
  if (typeof window === 'undefined') return
  try { window.sessionStorage.setItem(KEY, JSON.stringify(next)) } catch { /* The in-memory position still works. */ }
}

export function readSearchReturn(entityRef?: string): SearchReturnContext | null {
  let context = validSearchReturn(fallback)
  if (typeof window !== 'undefined') {
    try {
      const raw = window.sessionStorage.getItem(KEY)
      if (raw) context = validSearchReturn(JSON.parse(raw))
    } catch { /* Storage may be disabled or contain an obsolete value. */ }
  }
  return context && (!entityRef || context.entityRef === entityRef) ? context : null
}

export function searchReturnPath(entityRef: string): string {
  return readSearchReturn(entityRef)?.path ?? '/search'
}
