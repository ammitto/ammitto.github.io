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
        <a href="/browse" class="text-light-muted dark:text-dark-muted hover:text-brand-link">
          Browse
        </a>
        <span class="text-light-muted dark:text-dark-muted">/</span>
        <span class="text-light-text dark:text-dark-text">Actions</span>
      </div>

      <h1 class="text-4xl font-bold mb-4 text-light-text dark:text-dark-text">
        Action history
      </h1>
      <p class="text-light-muted dark:text-dark-muted mb-8 max-w-3xl">
        Action history and change logs are not yet available in the current publication.
      </p>

      <div class="glass-card p-6 mb-8 max-w-3xl">
        <h2 class="font-semibold text-lg mb-2 text-light-text dark:text-dark-text">
          Current data is available
        </h2>
        <p class="mb-4 text-light-muted dark:text-dark-muted">Search published records and open their listing details, or consult the official sources for announcements.</p>
        <p class="text-light-muted dark:text-dark-muted mb-4">
          Last data export: {{ stats?.generated_at ? new Date(stats.generated_at).toLocaleString() : '—' }}
        </p>
      </div>

      <div class="grid md:grid-cols-2 gap-6">
        <a
          href="/search"
          class="glass-card p-6 hover:border-brand-primary/50 transition-all group"
        >
          <h2 class="font-semibold text-lg mb-2 text-light-text dark:text-dark-text group-hover:text-brand-link transition-colors">
            Search Database
          </h2>
          <p class="text-light-muted dark:text-dark-muted text-sm">
            Search for specific entities across all data sources.
          </p>
        </a>

        <a
          href="/sources"
          class="glass-card p-6 hover:border-brand-primary/50 transition-all group"
        >
          <h2 class="font-semibold text-lg mb-2 text-light-text dark:text-dark-text group-hover:text-brand-link transition-colors">
            View Sources
          </h2>
          <p class="text-light-muted dark:text-dark-muted text-sm">
            Find official source links and publication information.
          </p>
        </a>
      </div>
    </div>
  </div>
</template>
