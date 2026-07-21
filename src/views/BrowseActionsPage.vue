<script setup lang="ts">
import { onMounted } from 'vue'
import { useSanctionsData } from '@/composables/useSanctionsData'

const { stats, loadStats } = useSanctionsData()

onMounted(() => {
  loadStats()
})
</script>

<template>
  <div class="min-h-screen">
    <div class="container-wide py-12">
      <div class="flex items-center gap-2 mb-6">
        <RouterLink to="/browse" class="text-light-muted dark:text-dark-muted hover:text-brand-primary">
          Browse
        </RouterLink>
        <span class="text-light-muted dark:text-dark-muted">/</span>
        <span class="text-light-text dark:text-dark-text">Actions</span>
      </div>

      <h1 class="text-4xl font-bold mb-4 text-light-text dark:text-dark-text">
        Browse Actions
      </h1>
      <p class="text-light-muted dark:text-dark-muted mb-8 max-w-3xl">
        Enforcement actions, updates, and changes to sanctions listings.
      </p>

      <div class="glass-card p-8 text-center mb-8">
        <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-brand-primary/20 flex items-center justify-center">
          <svg class="w-8 h-8 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <h3 class="font-semibold text-lg mb-2 text-light-text dark:text-dark-text">
          Actions & Updates
        </h3>
        <p class="text-light-muted dark:text-dark-muted mb-4">
          Last data export: {{ stats?.generated_at ? new Date(stats.generated_at).toLocaleString() : '—' }}
        </p>
      </div>

      <div class="glass-card p-6 mb-8">
        <h3 class="font-semibold text-lg mb-4 text-light-text dark:text-dark-text">
          Recent Activity
        </h3>
        <p class="text-light-muted dark:text-dark-muted">
          Action history and change logs are not yet available in the current version.
          Check back soon for detailed tracking of sanctions updates.
        </p>
      </div>

      <div class="grid md:grid-cols-2 gap-6">
        <RouterLink
          to="/search"
          class="glass-card p-6 hover:border-brand-primary/50 transition-all group"
        >
          <h3 class="font-semibold text-lg mb-2 text-light-text dark:text-dark-text group-hover:text-brand-primary transition-colors">
            Search Database
          </h3>
          <p class="text-light-muted dark:text-dark-muted text-sm">
            Search for specific entities across all data sources.
          </p>
        </RouterLink>

        <RouterLink
          to="/sources"
          class="glass-card p-6 hover:border-brand-primary/50 transition-all group"
        >
          <h3 class="font-semibold text-lg mb-2 text-light-text dark:text-dark-text group-hover:text-brand-primary transition-colors">
            View Sources
          </h3>
          <p class="text-light-muted dark:text-dark-muted text-sm">
            See all data sources and their update schedules.
          </p>
        </RouterLink>
      </div>
    </div>
  </div>
</template>
