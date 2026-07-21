<script setup lang="ts">
import { onMounted } from 'vue'
import { useSanctionsData } from '@/composables/useSanctionsData'
import { sources } from '@/config'

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
        <span class="text-light-text dark:text-dark-text">Sanctions</span>
      </div>

      <h1 class="text-4xl font-bold mb-4 text-light-text dark:text-dark-text">
        Browse Sanctions
      </h1>
      <p class="text-light-muted dark:text-dark-muted mb-8 max-w-3xl">
        Sanction entries and measures from all data sources.
      </p>

      <div class="glass-card p-8 text-center mb-8">
        <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-brand-primary/20 flex items-center justify-center">
          <svg class="w-8 h-8 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <h3 class="font-semibold text-lg mb-2 text-light-text dark:text-dark-text">
          Sanctions Summary
        </h3>
        <p class="text-light-muted dark:text-dark-muted mb-4">
          Total entries: {{ stats?.total_entries?.toLocaleString() || '—' }}
        </p>
        <RouterLink to="/search" class="btn-primary">
          Search Sanctions
        </RouterLink>
      </div>

      <div class="grid md:grid-cols-2 gap-6">
        <div v-for="source in sources" :key="source.code" class="glass-card p-6">
          <div class="flex items-center gap-3 mb-4">
            <div
              class="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              :style="{ backgroundColor: source.color }"
            >
              {{ source.country }}
            </div>
            <div>
              <h3 class="font-semibold text-light-text dark:text-dark-text">
                {{ source.name }}
              </h3>
              <p class="text-sm text-light-muted dark:text-dark-muted">
                {{ source.authority }}
              </p>
            </div>
          </div>

          <div class="flex justify-between text-sm mb-4">
            <div>
              <span class="text-light-muted dark:text-dark-muted">Entities:</span>
              <span class="font-medium ml-1 text-light-text dark:text-dark-text">
                {{ stats?.sources?.[source.code]?.entities?.toLocaleString() || '0' }}
              </span>
            </div>
            <div>
              <span class="text-light-muted dark:text-dark-muted">Entries:</span>
              <span class="font-medium ml-1 text-light-text dark:text-dark-text">
                {{ stats?.sources?.[source.code]?.entries?.toLocaleString() || '0' }}
              </span>
            </div>
          </div>

          <RouterLink
            :to="{ name: 'search', query: { source: source.code } }"
            class="text-brand-primary hover:underline text-sm font-medium"
          >
            View entities →
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>
