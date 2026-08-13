<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import Badge from '@/components/atoms/Badge.vue'
import SourceFilter from '@/components/SourceFilter.vue'
import { getLanguageName } from '@/utils/language'

interface LegalInstrument {
  '@id': string
  name?: string
  title?: Array<{ 'zh-Hans'?: string; 'en'?: string }> | string
  type?: string
  publishDate?: string
  effectiveDate?: string
  url?: string
  lang?: string
}

interface IndexNode {
  '@id': string
}

const route = useRoute()
const router = useRouter()

const instruments = ref<LegalInstrument[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const selectedSource = ref<string | null>(null)

// Extract source code from instrument ID
const getSourceCode = (id: string): string => {
  // ID format: https://www.ammitto.org/legal-instrument/cn/...
  const match = id.match(/legal-instrument\/([^/]+)/)
  return match ? match[1] : 'unknown'
}

// Compute source counts from instruments
const sourceCounts = computed(() => {
  const counts: Map<string, number> = new Map()
  for (const instrument of instruments.value) {
    const source = getSourceCode(instrument['@id'])
    counts.set(source, (counts.get(source) || 0) + 1)
  }
  return Array.from(counts.entries()).map(([code, count]) => ({ code, count }))
})

// Filter instruments by selected source
const filteredInstruments = computed(() => {
  if (!selectedSource.value) return instruments.value
  return instruments.value.filter(i => getSourceCode(i['@id']) === selectedSource.value)
})

const getDisplayTitle = (instrument: LegalInstrument): string => {
  if (instrument.title) {
    if (typeof instrument.title === 'string') return instrument.title
    if (Array.isArray(instrument.title)) {
      const enTitle = instrument.title.find(t => t['en'])?.['en']
      const zhTitle = instrument.title.find(t => t['zh-Hans'])?.['zh-Hans']
      return enTitle || zhTitle || instrument.name || 'Untitled'
    }
  }
  return instrument.name || 'Untitled'
}

const getChineseTitle = (instrument: LegalInstrument): string | null => {
  if (Array.isArray(instrument.title)) {
    return instrument.title.find(t => t['zh-Hans'])?.['zh-Hans'] || null
  }
  return null
}

const getInstrumentRef = (id: string): string => {
  return id.replace('https://www.ammitto.org/legal-instrument/', '')
}

const formatDate = (dateStr?: string): string => {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}

// Get language display name (imported from shared utility)
// getLanguageName is imported from '@/utils/language'

// Handle filter change and update URL
const handleFilterChange = (source: string | null) => {
  selectedSource.value = source
  if (source) {
    router.replace({ query: { source } })
  } else {
    router.replace({ query: {} })
  }
}

onMounted(async () => {
  // Initialize filter from URL
  if (route.query.source && typeof route.query.source === 'string') {
    selectedSource.value = route.query.source
  }

  try {
    const indexResponse = await fetch('/api/v1/node/legal-instrument/index.jsonld')
    if (!indexResponse.ok) {
      error.value = 'Failed to load legal instruments index'
      return
    }

    const indexData = await indexResponse.json()
    const nodes: IndexNode[] = indexData.nodes || []

    const loadedInstruments: LegalInstrument[] = []
    for (const node of nodes) {
      const ref = getInstrumentRef(node['@id'])
      const response = await fetch(`/api/v1/node/legal-instrument/${ref}.jsonld`)
      if (response.ok) {
        const data = await response.json()
        loadedInstruments.push(data)
      }
    }

    instruments.value = loadedInstruments
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="min-h-screen">
    <div class="container-wide py-8">
      <!-- Back link -->
      <RouterLink
        to="/browse"
        class="inline-flex items-center gap-2 text-light-muted dark:text-dark-muted hover:text-brand-link mb-6"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Browse
      </RouterLink>

      <div class="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 class="text-3xl font-bold text-light-fg dark:text-dark-fg mb-2">
            Legal Instruments
          </h1>
          <p class="text-light-muted dark:text-dark-muted">
            Laws, regulations, and legal documents that provide the basis for sanctions.
          </p>
        </div>
        <div class="text-right shrink-0">
          <div class="text-2xl font-bold text-light-fg dark:text-dark-fg">{{ filteredInstruments.length }}</div>
          <div class="text-sm text-light-muted dark:text-dark-muted">
            {{ selectedSource ? 'filtered' : 'total' }}
          </div>
        </div>
      </div>

      <!-- Source Filter -->
      <div v-if="!loading && !error" class="mb-6">
        <SourceFilter
          v-model="selectedSource"
          :counts="sourceCounts"
          @update:model-value="handleFilterChange"
        />
      </div>

      <!-- Loading state -->
      <div v-if="loading" class="flex items-center justify-center py-12">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
      </div>

      <!-- Error state -->
      <div v-else-if="error" class="text-center py-12">
        <p class="text-red-500">{{ error }}</p>
      </div>

      <!-- Empty state -->
      <div v-else-if="filteredInstruments.length === 0" class="text-center py-12">
        <p class="text-light-muted dark:text-dark-muted">No legal instruments found for the selected filter.</p>
      </div>

      <!-- Instruments list -->
      <div v-else class="space-y-4">
        <RouterLink
          v-for="instrument in filteredInstruments"
          :key="instrument['@id']"
          :to="`/legal-instrument/${getInstrumentRef(instrument['@id'])}`"
          class="block min-w-0 bg-white dark:bg-dark-card rounded-lg shadow-sm border border-light-border dark:border-dark-border p-6 hover:border-brand-primary/50 transition-all"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1">
              <h3 class="text-lg font-semibold text-light-fg dark:text-dark-fg mb-1">
                {{ getDisplayTitle(instrument) }}
              </h3>
              <p v-if="getChineseTitle(instrument)" class="text-sm text-light-muted dark:text-dark-muted mb-3">
                {{ getChineseTitle(instrument) }}
              </p>
              <div class="flex flex-wrap gap-2">
                <Badge v-if="instrument.type" variant="default">{{ instrument.type }}</Badge>
                <Badge v-if="instrument.lang" variant="default">{{ getLanguageName(instrument.lang) }}</Badge>
                <Badge v-if="instrument.publishDate" variant="default">
                  Published: {{ formatDate(instrument.publishDate) }}
                </Badge>
                <Badge v-if="instrument.effectiveDate" variant="default">
                  Effective: {{ formatDate(instrument.effectiveDate) }}
                </Badge>
              </div>
            </div>
            <svg class="w-5 h-5 text-light-muted dark:text-dark-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </RouterLink>
      </div>
    </div>
  </div>
</template>
