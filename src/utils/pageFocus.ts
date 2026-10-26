/** Keep focus intent across native page loads without interfering with Back. */
export function installPageFocus(): void {
  const key = 'ammitto.navigation-focus'
  const targetPath = (pathname: string, search: string) => (pathname.replace(/\/$/, '') || '/') + search
  let focusMain = false
  try {
    const destination = sessionStorage.getItem(key)
    sessionStorage.removeItem(key)
    focusMain = destination === targetPath(location.pathname, location.search)
  } catch {
    // Storage can be disabled. A same-origin document navigation still gives
    // us a referrer; reloads, history traversal and fragment targets keep focus.
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    try {
      focusMain = navigation?.type === 'navigate' && !location.hash &&
        new URL(document.referrer).origin === location.origin
    } catch { /* A direct visit has no referrer. */ }
  }
  if (focusMain) document.getElementById('main-content')?.focus({ preventScroll: true })

  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]')
    if (!anchor || (anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return
    const destination = new URL(anchor.href, location.href)
    if (destination.origin !== location.origin || destination.hash) return
    try { sessionStorage.setItem(key, targetPath(destination.pathname, destination.search)) } catch { /* Referrer fallback above. */ }
  })
}
