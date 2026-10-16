import { onMounted, onUnmounted } from 'vue'

export function useScrollAnimation() {
  let observer: IntersectionObserver | null = null
  let motionPreference: MediaQueryList | null = null
  let elements: Element[] = []

  function revealAll() {
    observer?.disconnect()
    elements.forEach(element => element.classList.remove('animate-pending'))
  }

  function onMotionChange(event: MediaQueryListEvent) {
    if (event.matches) revealAll()
  }

  onMounted(() => {
    // Content is visible without JavaScript, observer support or motion.
    // Only below-screen elements opt into the decorative entrance effect.
    if (typeof IntersectionObserver === 'undefined' || typeof window.matchMedia !== 'function') return
    motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (motionPreference.matches) return
    motionPreference.addEventListener('change', onMotionChange)
    elements = [...document.querySelectorAll('.animate-on-scroll')]
    observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.remove('animate-pending')
          entry.target.classList.add('animate-in')
          observer?.unobserve(entry.target)
        }
      })
    }, { threshold: 0 })
    elements.forEach(element => {
      if (element.getBoundingClientRect().top >= window.innerHeight) {
        element.classList.add('animate-pending')
        observer?.observe(element)
      }
    })
  })

  onUnmounted(() => {
    revealAll()
    motionPreference?.removeEventListener('change', onMotionChange)
  })
}
