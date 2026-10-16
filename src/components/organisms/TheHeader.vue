<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import Logo from '@/components/atoms/Logo.vue'
import ThemeToggle from '@/components/atoms/ThemeToggle.vue'

const route = useRoute()
const mobileMenuOpen = ref(false)
const menuButton = ref<HTMLButtonElement>()
const mobileNavigation = ref<HTMLElement>()
const desktopNavigation = ref<HTMLElement>()
let desktopMedia: MediaQueryList | undefined

const navItems = [
  { name: 'Home', path: '/', sections: ['/'] },
  { name: 'Search', path: '/search', sections: ['/search', '/entity/'] },
  { name: 'Browse', path: '/browse', sections: ['/browse', '/announcement/', '/group/', '/legal-instrument/', '/document-type/', '/organization/'] },
  { name: 'Ontology', path: '/ontology', sections: ['/ontology'] },
  { name: 'API', path: '/api', sections: ['/api'] },
  { name: 'Download', path: '/download', sections: ['/download'] },
  { name: 'About', path: '/about', sections: ['/about'] },
  { name: 'License', path: '/license', sections: ['/license'] },
]

const isActive = (item: typeof navItems[0]) => item.sections.some(section =>
  section === '/' ? route.path === '/' : section.endsWith('/') ? route.path.startsWith(section) : route.path === section || route.path.startsWith(`${section}/`),
)

function closeMenu(restoreFocus = false) {
  if (!mobileMenuOpen.value) return
  mobileMenuOpen.value = false
  if (restoreFocus) menuButton.value?.focus()
}

function navigateFromMenu() {
  closeMenu()
  nextTick(() => document.getElementById('main-content')?.focus())
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && mobileMenuOpen.value) {
    event.preventDefault()
    closeMenu(true)
  }
}

function onBreakpointChange(event: MediaQueryListEvent) {
  if (event.matches) {
    const focusWasMobile = mobileNavigation.value?.contains(document.activeElement) || document.activeElement === menuButton.value
    closeMenu()
    if (focusWasMobile) nextTick(() => desktopNavigation.value?.querySelector<HTMLAnchorElement>('a')?.focus())
  } else if (desktopNavigation.value?.contains(document.activeElement)) {
    nextTick(() => menuButton.value?.focus())
  }
}

watch(() => route.fullPath, () => {
  if (mobileMenuOpen.value) navigateFromMenu()
})

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  desktopMedia = window.matchMedia('(min-width: 1024px)')
  desktopMedia.addEventListener('change', onBreakpointChange)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  desktopMedia?.removeEventListener('change', onBreakpointChange)
})
</script>

<template>
  <header class="site-header sticky top-0 z-50 bg-light-bg/80 dark:bg-dark-bg/80 backdrop-blur-lg border-b border-light-border dark:border-dark-border">
    <a href="#main-content" class="skip-link">Skip to main content</a>
    <div class="container-wide">
      <div class="flex min-h-16 items-center justify-between gap-4">
        <Logo />

        <nav ref="desktopNavigation" aria-label="Main navigation" class="hidden min-w-0 lg:flex flex-wrap items-center justify-center gap-x-4 xl:gap-x-6 gap-y-0">
          <RouterLink
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            class="site-nav-link text-sm font-medium"
            :aria-current="isActive(item) ? (route.path === item.path ? 'page' : 'location') : undefined"
            :class="isActive(item)
              ? 'text-brand-link'
              : 'text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text'"
          >
            {{ item.name }}
          </RouterLink>
        </nav>

        <div class="flex items-center gap-2">
          <ThemeToggle />
          <button
            ref="menuButton"
            type="button"
            @click="mobileMenuOpen = !mobileMenuOpen"
            class="lg:hidden min-h-11 min-w-11 p-2 rounded-lg hover:bg-light-surface dark:hover:bg-dark-surface transition-colors"
            aria-label="Main menu"
            aria-controls="mobile-navigation"
            :aria-expanded="mobileMenuOpen"
          >
            <svg aria-hidden="true" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path v-if="!mobileMenuOpen" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
              <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <nav
        v-show="mobileMenuOpen"
        id="mobile-navigation"
        ref="mobileNavigation"
        aria-label="Mobile navigation"
        class="lg:hidden max-h-[calc(100dvh-4rem-1px)] overflow-y-auto py-3 border-t border-light-border dark:border-dark-border"
      >
        <div class="flex flex-col gap-1">
          <RouterLink
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            class="min-h-11 px-3 py-2.5 rounded text-sm font-medium"
            :aria-current="isActive(item) ? (route.path === item.path ? 'page' : 'location') : undefined"
            :class="isActive(item)
              ? 'bg-brand-primary/10 text-brand-link'
              : 'hover:bg-light-surface dark:hover:bg-dark-surface text-light-muted dark:text-dark-muted'"
            @click="navigateFromMenu"
          >
            {{ item.name }}
          </RouterLink>
        </div>
      </nav>
    </div>
  </header>
</template>

<style scoped>
.site-nav-link {
  display: inline-flex;
  align-items: center;
  min-height: 4rem;

}

.site-nav-link[aria-current] {
  text-decoration: underline;
  text-underline-offset: 0.3em;
}
</style>
