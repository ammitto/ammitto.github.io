<script setup lang="ts">
import { onMounted } from 'vue'
import SourceCard from '@/components/molecules/SourceCard.vue'
import { sources } from '@/config'
import { useSanctionsData } from '@/composables/useSanctionsData'

const { stats, loadStats } = useSanctionsData()

onMounted(() => {
  loadStats()
})
</script>

<template>
  <div class="min-h-screen">
    <div class="container-wide py-12">
      <h1 class="text-4xl font-bold mb-4 text-light-text dark:text-dark-text">
        Data Sources
      </h1>
      <p class="text-light-muted dark:text-dark-muted mb-8 max-w-3xl">
        Ammitto aggregates sanctions data from {{ sources.length }} official international sources.
        Each source is synced daily to ensure accuracy and completeness.
      </p>

      <div class="mb-8 p-4 glass-card">
        <div class="flex flex-wrap gap-8">
          <div>
            <div class="text-2xl font-bold text-brand-primary">
              {{ sources.length }}
            </div>
            <div class="text-sm text-light-muted dark:text-dark-muted">
              Data Sources
            </div>
          </div>
          <div>
            <div class="text-2xl font-bold text-brand-primary">
              {{ stats?.total_entities?.toLocaleString() || '—' }}
            </div>
            <div class="text-sm text-light-muted dark:text-dark-muted">
              Total Entities
            </div>
          </div>
          <div>
            <div class="text-2xl font-bold text-brand-primary">
              {{ stats?.total_entries?.toLocaleString() || '—' }}
            </div>
            <div class="text-sm text-light-muted dark:text-dark-muted">
              Total Entries
            </div>
          </div>
        </div>
      </div>

      <div class="grid md:grid-cols-2 gap-6">
        <SourceCard
          v-for="source in sources"
          :key="source.code"
          :name="source.name"
          :full-name="source.fullName"
          :description="source.description"
          :entity-count="stats?.sources?.[source.code]?.entities"
          :entry-count="stats?.sources?.[source.code]?.entries"
          :color="source.color"
          :url="source.url"
          :authority="source.authority"
          :country="source.country"
        />
      </div>

      <div class="mt-12 p-6 glass-card">
        <h2 class="text-xl font-semibold mb-4 text-light-text dark:text-dark-text">
          Data Freshness
        </h2>
        <p class="text-light-muted dark:text-dark-muted">
          Data is synchronized daily from official government sources. The last update was:
          <span v-if="stats?.generated_at" class="font-medium text-light-text dark:text-dark-text">
            {{ new Date(stats.generated_at).toLocaleString() }}
          </span>
        </p>
        <p class="text-light-muted dark:text-dark-muted mt-2">
          Note: Some sources may have more recent updates than our last sync. Always verify
          critical information directly with the official source.
        </p>
      </div>
    </div>
  </div>
</template>
