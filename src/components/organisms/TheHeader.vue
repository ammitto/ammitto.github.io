<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import Logo from '@/components/atoms/Logo.vue'
import ThemeToggle from '@/components/atoms/ThemeToggle.vue'

/**
 * A masthead, not an app bar.
 *
 * The previous header was a 64px sticky bar with `backdrop-blur-lg` over a
 * translucent ground — the standard SaaS chrome. Two things were wrong with
 * it here. The blur is decorative and costs a compositing layer on every
 * scroll, and the translucency meant the nav sat on an indeterminate colour,
 * which is the same undecidability that cost the hero gradient its contrast
 * allowance.
 *
 * This one is opaque, thin, and ruled. The wordmark sits on the left margin of
 * the sheet; the nav is set in mono small-caps at label size, which is the
 * register's own voice for structural text. Nothing floats.
 */
const route = useRoute()
const mobileMenuOpen = ref(false)

const navItems = [
  { name: 'Search', path: '/search', nameRoute: 'search' },
  { name: 'Browse', path: '/browse', nameRoute: 'browse' },
  { name: 'Ontology', path: '/ontology', nameRoute: 'ontology' },
  { name: 'API', path: '/api', nameRoute: 'api' },
  { name: 'About', path: '/about', nameRoute: 'about' },
  { name: 'License', path: '/license', nameRoute: 'license' },
]

const isActive = (item: (typeof navItems)[0]) =>
  item.nameRoute ? route.name === item.nameRoute : route.path === item.path
</script>

<template>
  <header
    class="sticky top-0 z-50 bg-light-bg dark:bg-dark-bg border-b border-light-text dark:border-dark-text"
  >
    <div class="container-register">
      <div class="flex items-center justify-between h-14 gap-6">
        <!-- Logo already renders its own RouterLink; wrapping it in a
             second one nested an <a> inside an <a>, invalid HTML that
             also broke screen-reader link announcement. class/aria-label
             fall through to Logo's root element instead. -->
        <Logo class="shrink-0" aria-label="Ammitto — home" />

        <nav class="hidden md:flex items-center gap-7" aria-label="Sections">
          <RouterLink
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            class="nav-link font-mono text-label uppercase transition-colors"
            :class="
              isActive(item)
                ? 'text-brand-link'
                : 'text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text'
            "
          >
            {{ item.name }}
          </RouterLink>
        </nav>

        <div class="flex items-center gap-1 shrink-0">
          <ThemeToggle />
          <button
            class="md:hidden p-2"
            :aria-expanded="mobileMenuOpen"
            aria-controls="masthead-nav"
            aria-label="Toggle menu"
            @click="mobileMenuOpen = !mobileMenuOpen"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                v-if="!mobileMenuOpen"
                stroke-linecap="square"
                stroke-width="2"
                d="M4 7h16M4 12h16M4 17h16"
              />
              <path v-else stroke-linecap="square" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <nav
        v-if="mobileMenuOpen"
        id="masthead-nav"
        class="md:hidden border-t border-light-border dark:border-dark-border"
        aria-label="Sections"
      >
        <RouterLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="block font-mono text-label uppercase py-3 border-b border-light-border dark:border-dark-border"
          :class="isActive(item) ? 'text-brand-link' : 'text-light-muted dark:text-dark-muted'"
          @click="mobileMenuOpen = false"
        >
          {{ item.name }}
        </RouterLink>
      </nav>
    </div>
  </header>
</template>

<style scoped>
/*
 * The active section gets a rule under it rather than a pill behind it — the
 * register marks a place, it does not highlight a button.
 */
.nav-link {
  position: relative;
  padding-block: 0.35rem;
}
.nav-link::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background-color: currentColor;
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.nav-link:hover::after,
.nav-link.text-brand-link::after {
  transform: scaleX(1);
}
@media (prefers-reduced-motion: reduce) {
  .nav-link::after {
    transition: none;
  }
}
</style>
