<script setup lang="ts">
import { sources } from '@/config'

const browseOptions = [
  {
    title: 'Entities',
    description: 'Browse all sanctioned individuals, organizations, vessels, and aircraft.',
    icon: '👤',
    link: '/browse/entities',
    color: '#f59e0b',
  },
  {
    title: 'Sanctions',
    description: 'Browse sanction entries and measures.',
    icon: '📋',
    link: '/browse/sanctions',
    color: '#10b981',
  },
  {
    title: 'Actions',
    description: 'Browse enforcement actions and updates.',
    icon: '⚡',
    link: '/browse/actions',
    color: '#8b5cf6',
  },
]
</script>

<template>
  <div class="min-h-screen">
    <div class="container-wide py-12">
      <h1 class="text-4xl font-bold mb-4 text-light-text dark:text-dark-text">
        Browse Data
      </h1>
      <p class="text-light-muted dark:text-dark-muted mb-8 max-w-3xl">
        Explore sanctions data by category. Use the options below to browse
        entities, sanctions, and actions.
      </p>

      <div class="grid md:grid-cols-3 gap-6 mb-12">
        <RouterLink
          v-for="option in browseOptions"
          :key="option.link"
          :to="option.link"
          class="glass-card p-6 hover:border-brand-primary/50 transition-all group"
        >
          <div
            class="w-12 h-12 rounded-lg flex items-center justify-center text-2xl mb-4"
            :style="{ backgroundColor: option.color + '20' }"
          >
            {{ option.icon }}
          </div>
          <h3 class="font-semibold text-lg mb-2 text-light-text dark:text-dark-text group-hover:text-brand-primary transition-colors">
            {{ option.title }}
          </h3>
          <p class="text-light-muted dark:text-dark-muted text-sm">
            {{ option.description }}
          </p>
        </RouterLink>
      </div>

      <section class="mb-12">
        <h2 class="text-2xl font-semibold mb-4 text-light-text dark:text-dark-text">
          Browse by Source
        </h2>
        <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <RouterLink
            v-for="source in sources"
            :key="source.code"
            :to="{ name: 'search', query: { source: source.code } }"
            class="glass-card p-4 hover:border-brand-primary/50 transition-all group"
          >
            <div
              class="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm mb-3"
              :style="{ backgroundColor: source.color }"
            >
              {{ source.country }}
            </div>
            <h3 class="font-semibold text-light-text dark:text-dark-text group-hover:text-brand-primary transition-colors">
              {{ source.name }}
            </h3>
          </RouterLink>
        </div>
      </section>

      <section>
        <h2 class="text-2xl font-semibold mb-4 text-light-text dark:text-dark-text">
          Quick Links
        </h2>
        <div class="flex flex-wrap gap-4">
          <RouterLink to="/search" class="btn-primary">
            Search All Data
          </RouterLink>
          <RouterLink to="/api" class="btn-secondary">
            API Documentation
          </RouterLink>
        </div>
      </section>
    </div>
  </div>
</template>
