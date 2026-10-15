/** Register after page load, without delaying hydration or interrupting a session. */
export function registerServiceWorker(baseUrl = '/'): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return
  if (!window.isSecureContext || !('serviceWorker' in navigator)) return

  const register = (): void => {
    // A failed/unsupported cache must never prevent the site from working.
    void navigator.serviceWorker.register(`${baseUrl}service-worker.js`, {
      scope: baseUrl,
      updateViaCache: 'none',
    }).catch(() => {})
  }

  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}
