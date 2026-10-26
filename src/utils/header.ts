/** Small document controls do not need a hydrated Vue application. */
export function installHeader(): void {
  const header = document.querySelector<HTMLElement>('.site-header')!
  const button = header.querySelector<HTMLButtonElement>('[data-menu-toggle]')!
  const mobile = header.querySelector<HTMLElement>('[data-mobile-navigation]')!
  const desktop = header.querySelector<HTMLElement>('[data-desktop-navigation]')!
  const icon = button.querySelector<SVGPathElement>('[data-menu-icon]')!
  const theme = header.querySelector<HTMLButtonElement>('[data-theme-toggle]')!
  let open = false

  function close(restoreFocus = false) {
    setOpen(false)
    if (restoreFocus) button.focus()
  }
  function setOpen(value: boolean) {
    open = value
    mobile.hidden = !open
    button.setAttribute('aria-expanded', String(open))
    icon.setAttribute('d', open ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16')
  }
  function syncTheme() {
    theme.setAttribute('aria-label', document.documentElement.classList.contains('dark') ? 'Switch to light mode' : 'Switch to dark mode')
  }
  function syncNavigation() {
    const path = location.pathname.replace(/\/$/, '') || '/'
    for (const anchor of header.querySelectorAll<HTMLAnchorElement>('a[data-nav-path]')) {
      const sections: string[] = JSON.parse(anchor.dataset.sections!)
      const active = sections.some(section => section === '/' ? path === '/' :
        section.endsWith('/') ? path.startsWith(section) : path === section || path.startsWith(`${section}/`))
      const narrow = mobile.contains(anchor)
      if (active) anchor.setAttribute('aria-current', path === anchor.dataset.navPath ? 'page' : 'location')
      else anchor.removeAttribute('aria-current')
      const tokens = {
        'text-brand-link': active,
        'bg-brand-primary/10': active && narrow,
        'text-light-muted': !active, 'dark:text-dark-muted': !active,
        'hover:text-light-text': !active && !narrow, 'dark:hover:text-dark-text': !active && !narrow,
        'hover:bg-light-surface': !active && narrow, 'dark:hover:bg-dark-surface': !active && narrow,
      }
      for (const [token, present] of Object.entries(tokens)) anchor.classList.toggle(token, present)
    }
  }
  button.addEventListener('click', () => setOpen(!open))
  mobile.addEventListener('click', event => {
    if ((event.target as Element | null)?.closest('a[href]')) close()
  })
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); close(true) }
  })
  window.matchMedia('(min-width: 1024px)').addEventListener('change', event => {
    if (event.matches) {
      const wasMobile = mobile.contains(document.activeElement) || document.activeElement === button
      close()
      if (wasMobile) desktop.querySelector<HTMLAnchorElement>('a')?.focus()
    } else if (desktop.contains(document.activeElement)) button.focus()
  })
  theme.addEventListener('click', () => {
    const dark = document.documentElement.classList.toggle('dark')
    try { localStorage.setItem('theme', dark ? 'dark' : 'light') } catch { /* In-page theme still works. */ }
    syncTheme()
  })
  window.addEventListener('popstate', () => { syncNavigation(); close() })
  window.addEventListener('pageshow', () => { syncNavigation(); syncTheme(); close() })
  syncNavigation()
  syncTheme()
}
