<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import Badge from '@/components/atoms/Badge.vue'
import SourceFilter from '@/components/SourceFilter.vue'

interface SanctionGroup {
  id: string
  announcement_id?: string
  announcement_title?: string
  entry_ids?: string[]
  effective_date?: string
  entity_count?: number
  notes?: string
}

interface IndexNode {
  '@id': string
}

const route = useRoute()
const router = useRouter()

const groups = ref<SanctionGroup[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const selectedSource = ref<string | null>(null)

// Extract source code from group ID
const getSourceCode = (id: string): string => {
  // ID format: https://www.ammitto.org/group/cn/1
  const match = id.match(/group\/([^/]+)/)
  return match ? match[1] : 'unknown'
}

// Compute source counts from groups
const sourceCounts = computed(() => {
  const counts: Map<string, number> = new Map()
  for (const group of groups.value) {
    const source = getSourceCode(group.id)
    counts.set(source, (counts.get(source) || 0) + 1)
  }
  return Array.from(counts.entries()).map(([code, count]) => ({ code, count }))
})

// Filter groups by selected source
const filteredGroups = computed(() => {
  if (!selectedSource.value) return groups.value
  return groups.value.filter(g => getSourceCode(g.id) === selectedSource.value)
})

const getGroupRef = (id: string): string => {
  return id.replace('https://www.ammitto.org/group/', '')
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
    const indexResponse = await fetch('/api/v1/node/group/index.jsonld')
    if (!indexResponse.ok) {
      error.value = 'Failed to load sanction groups index'
      return
    }

    const indexData = await indexResponse.json()
    const nodes: IndexNode[] = indexData.nodes || []

    const loadedGroups: SanctionGroup[] = []
    for (const node of nodes) {
      const ref = getGroupRef(node['@id'])
      const response = await fetch(`/api/v1/node/group/${ref}.jsonld`)
      if (response.ok) {
        const data = await response.json()
        loadedGroups.push(data)
      }
    }

    // Sort by effective date descending
    groups.value = loadedGroups.sort((a, b) => {
      if (!a.effective_date) return 1
      if (!b.effective_date) return -1
      return new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime()
    })
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
        class="inline-flex items-center gap-2 text-light-muted dark:text-dark-muted hover:text-brand-primary mb-6"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Browse
      </RouterLink>

      <div class="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 class="text-3xl font-bold text-light-fg dark:text-dark-fg mb-2">
            Sanction Groups
          </h1>
          <p class="text-light-muted dark:text-dark-muted">
            Collections of sanctions announced together in a single announcement.
          </p>
        </div>
        <div class="text-right shrink-0">
          <div class="text-2xl font-bold text-light-fg dark:text-dark-fg">{{ filteredGroups.length }}</div>
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
      <div v-else-if="filteredGroups.length === 0" class="text-center py-12">
        <p class="text-light-muted dark:text-dark-muted">No sanction groups found for the selected filter.</p>
      </div>

      <!-- Groups list -->
      <div v-else class="space-y-4">
        <RouterLink
          v-for="group in filteredGroups"
          :key="group.id"
          :to="`/group/${getGroupRef(group.id)}`"
          class="block bg-white dark:bg-dark-card rounded-lg shadow-sm border border-light-border dark:border-dark-border p-6 hover:border-brand-primary/50 transition-all"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1">
              <h3 class="text-lg font-semibold text-light-fg dark:text-dark-fg mb-1">
                {{ group.announcement_title || `Group ${getGroupRef(group.id)}` }}
              </h3>
              <p v-if="group.announcement_title" class="text-xs text-light-muted dark:text-dark-muted mb-2 font-mono">
                {{ getGroupRef(group.id) }}
              </p>
              <div class="flex flex-wrap gap-2">
                <Badge v-if="group.effective_date" variant="default">
                  {{ formatDate(group.effective_date) }}
                </Badge>
                <Badge v-if="group.entity_count" variant="default">
                  {{ group.entity_count }} entities
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
