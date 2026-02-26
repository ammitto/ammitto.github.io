<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import Logo from '@/components/atoms/Logo.vue'
import ThemeToggle from '@/components/atoms/ThemeToggle.vue'

const route = useRoute()
const mobileMenuOpen = ref(false)

const navItems = [
  { name: 'Home', path: '/', nameRoute: 'home' },
  { name: 'Search', path: '/search', nameRoute: 'search' },
  { name: 'Browse', path: '/browse', nameRoute: 'browse' },
  { name: 'Ontology', path: '/ontology', nameRoute: 'ontology' },
  { name: 'API', path: '/api', nameRoute: 'api' },
  { name: 'About', path: '/about', nameRoute: 'about' },
]

const isActive = (item: typeof navItems[0]) => {
  if (item.nameRoute) {
    return route.name === item.nameRoute
  }
  return route.path === item.path
}
</script>

<template>
  <header class="sticky top-0 z-50 bg-light-bg/80 dark:bg-dark-bg/80 backdrop-blur-lg border-b border-light-border dark:border-dark-border">
    <div class="container-wide">
      <div class="flex items-center justify-between h-16">
        <Logo />

        <nav class="hidden md:flex items-center gap-6">
          <RouterLink
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            class="text-sm font-medium transition-colors"
            :class="isActive(item)
              ? 'text-brand-primary'
              : 'text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text'"
          >
            {{ item.name }}
          </RouterLink>
        </nav>

        <div class="flex items-center gap-2">
          <ThemeToggle />
          <button
            @click="mobileMenuOpen = !mobileMenuOpen"
            class="md:hidden p-2 rounded-lg hover:bg-light-surface dark:hover:bg-dark-surface transition-colors"
            aria-label="Toggle menu"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path v-if="!mobileMenuOpen" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
              <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <nav
        v-if="mobileMenuOpen"
        class="md:hidden py-4 border-t border-light-border dark:border-dark-border"
      >
        <div class="flex flex-col gap-2">
          <RouterLink
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            class="px-4 py-2 rounded-lg transition-colors"
            :class="isActive(item)
              ? 'bg-brand-primary/10 text-brand-primary'
              : 'hover:bg-light-surface dark:hover:bg-dark-surface text-light-muted dark:text-dark-muted'"
            @click="mobileMenuOpen = false"
          >
            {{ item.name }}
          </RouterLink>
        </div>
      </nav>
    </div>
  </header>
</template>
