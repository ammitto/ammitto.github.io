<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SearchInput from '@/components/atoms/SearchInput.vue'
import Badge from '@/components/atoms/Badge.vue'
import EntityCard from '@/components/molecules/EntityCard.vue'
import SearchFilters from '@/components/organisms/SearchFilters.vue'
import { useScrollAnimation } from '@/composables/useScrollAnimation'
import { useSearchIndex, type SearchEntity } from '@/composables/useSearchIndex'
import { normalizeSourceCode } from '@/config'

// Initialize scroll animations
useScrollAnimation()

const route = useRoute()
const router = useRouter()

// Search state
const searchQuery = ref('')
const debouncedQuery = ref('')
const filters = ref({
  sources: [] as string[],
  entityTypes: [] as string[],
  statuses: [] as string[],
})

// Pagination
const PAGE_SIZE = 50
const loadedCount = ref(PAGE_SIZE)

// Load data from lightweight search index
const {
  isLoading: loading,
  error,
  totalEntities: entityCount,
  sourceCount,
  authorityFacets,
  typeFacets,
  statusFacets,
  loadSearchIndex,
  loadFacets,
  search,
  filter,
} = useSearchIndex()

// Load data on mount
onMounted(async () => {
  // Initialize from URL params
  const { q, source, type, status } = route.query
  if (q) searchQuery.value = q as string
  if (source) {
    const src = Array.isArray(source) ? source : [source]
    // Normalize legacy hyphenated codes (eu-vessels -> eu_vessels) so old
    // bookmarks keep filtering; the filters watcher below then canonicalizes
    // the URL via router.replace. Query values can carry null entries and
    // normalization can collapse mixed forms into duplicates, so keep only
    // strings and de-duplicate.
    filters.value.sources = [...new Set(
      src.filter((s): s is string => typeof s === 'string')
        .map(normalizeSourceCode),
    )]
  }
  if (type) {
    const typ = Array.isArray(type) ? type : [type]
    filters.value.entityTypes = typ as string[]
  }
  if (status) {
    const stat = Array.isArray(status) ? status : [status]
    filters.value.statuses = stat as string[]
  }

  // Load search index and facets
  await Promise.all([loadSearchIndex(), loadFacets()])
})

// Debounce search query
let debounceTimer: ReturnType<typeof setTimeout> | null = null
watch(searchQuery, (newQuery) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debouncedQuery.value = newQuery
    loadedCount.value = PAGE_SIZE // Reset pagination on new search
  }, 150)
})

// Update URL when filters change
watch([searchQuery, filters], () => {
  loadedCount.value = PAGE_SIZE // Reset pagination when filters change
  const query: Record<string, string | string[]> = {}
  if (searchQuery.value) query.q = searchQuery.value
  if (filters.value.sources.length > 0) query.source = filters.value.sources
  if (filters.value.entityTypes.length > 0) query.type = filters.value.entityTypes
  if (filters.value.statuses.length > 0) query.status = filters.value.statuses
  router.replace({ query })
}, { deep: true })

// Transform SearchEntity format for EntityCard
const entityAdapter = (entity: SearchEntity) => ({
  id: entity.id,
  ref: entity.ref, // Short reference for clean URLs
  names: entity.names,
  entityType: entity.type,
  source: entity.authority || 'unknown',
  status: (entity.status || 'active') as 'active' | 'suspended' | 'delisted',
  listedDate: undefined,
  country: entity.country,
  birthDate: entity.birthYear,
})

// Filtered results with debounced search
const filteredEntities = computed(() => {
  // Get search results - use very high limit to include all entities for filtering
  let results = search(debouncedQuery.value, 100000) // Get all results for filtering

  // Apply filters
  results = filter(results, {
    authorities: filters.value.sources.length > 0 ? filters.value.sources : undefined,
    types: filters.value.entityTypes.length > 0 ? filters.value.entityTypes : undefined,
    statuses: filters.value.statuses.length > 0 ? filters.value.statuses : undefined,
  })

  return results.map(entityAdapter)
})

// Paginated results
const paginatedEntities = computed(() => {
  return filteredEntities.value.slice(0, loadedCount.value)
})

const hasMoreResults = computed(() => {
  return loadedCount.value < filteredEntities.value.length
})

const loadMore = () => {
  loadedCount.value += PAGE_SIZE
}

// Count per category for filter badges (use facets when available)
const counts = computed(() => {
  const sourceCountsMap: Record<string, number> = {}
  const typeCountsMap: Record<string, number> = {}
  const statusCountsMap: Record<string, number> = {}

  // Use facets for source counts (more accurate)
  for (const facet of authorityFacets.value) {
    sourceCountsMap[facet.code] = facet.count
  }

  // Use facets for entity type counts
  for (const facet of typeFacets.value) {
    typeCountsMap[facet.code] = facet.count
  }

  // Use facets for status counts
  for (const facet of statusFacets.value) {
    statusCountsMap[facet.code] = facet.count
  }

  return {
    sources: sourceCountsMap,
    entityTypes: typeCountsMap,
    statuses: statusCountsMap,
  }
})

// Clear all filters
const clearFilters = () => {
  searchQuery.value = ''
  debouncedQuery.value = ''
  loadedCount.value = PAGE_SIZE
  filters.value = {
    sources: [],
    entityTypes: [],
    statuses: [],
  }
}

const hasActiveFilters = computed(() =>
  searchQuery.value ||
  filters.value.sources.length > 0 ||
  filters.value.entityTypes.length > 0 ||
  filters.value.statuses.length > 0
)

const activeFilterCount = computed(() =>
  (searchQuery.value ? 1 : 0) +
  filters.value.sources.length +
  filters.value.entityTypes.length +
  filters.value.statuses.length
)

// Source names for display
const sources = computed(() =>
  authorityFacets.value.map(f => ({ code: f.code, name: f.name || f.code }))
)

const entityTypes = computed(() =>
  typeFacets.value.map(f => ({ code: f.code, name: f.name || f.code }))
)

const statuses = computed(() =>
  statusFacets.value.map(f => ({ code: f.code, name: f.name || f.code }))
)
</script>

<template>
  <div class="min-h-screen">
    <!-- Search Header -->
    <div class="bg-light-surface/50 dark:bg-dark-surface/50 border-b border-light-border dark:border-dark-border">
      <div class="container-wide py-8">
        <div class="max-w-3xl mx-auto">
          <!-- Title -->
          <h1 class="text-3xl font-bold mb-2 text-center">
            Search Sanctions Database
          </h1>
          <p class="text-light-muted dark:text-dark-muted text-center mb-8">
            Search across {{ sourceCount }} data sources covering {{ entityCount.toLocaleString() }} sanctioned entities.
          </p>

          <!-- Search Input -->
          <div>
            <SearchInput
              v-model="searchQuery"
              placeholder="Search by name, alias, country, or identifier..."
              size="lg"
              :loading="loading"
            />
          </div>

          <!-- Active Filters Summary -->
          <div v-if="hasActiveFilters" class="mt-4 flex items-center justify-center gap-2 flex-wrap">
            <span class="text-sm text-light-muted dark:text-dark-muted">
              {{ activeFilterCount }} filter{{ activeFilterCount !== 1 ? 's' : '' }} active:
            </span>
            <div class="flex flex-wrap gap-2">
              <Badge
                v-for="code in filters.sources"
                :key="'source-' + code"
                variant="source"
                class="cursor-pointer"
                @click="filters.sources = filters.sources.filter(s => s !== code)"
              >
                {{ sources.find(s => s.code === code)?.name || code }}
                <svg class="w-3 h-3 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Badge>
              <Badge
                v-for="code in filters.entityTypes"
                :key="'type-' + code"
                :variant="code as any"
                class="cursor-pointer"
                @click="filters.entityTypes = filters.entityTypes.filter(t => t !== code)"
              >
                {{ entityTypes.find(t => t.code === code)?.name || code }}
                <svg class="w-3 h-3 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Badge>
              <Badge
                v-for="code in filters.statuses"
                :key="'status-' + code"
                :variant="code as any"
                class="cursor-pointer"
                @click="filters.statuses = filters.statuses.filter(s => s !== code)"
              >
                {{ statuses.find(s => s.code === code)?.name || code }}
                <svg class="w-3 h-3 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Badge>
            </div>
            <button
              @click="clearFilters"
              class="text-sm text-status-active hover:underline"
            >
              Clear all
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div class="container-wide py-8">
      <!-- Error State -->
      <div v-if="error" class="glass-card p-8 text-center mb-8">
        <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-status-delisted/20 flex items-center justify-center">
          <svg class="w-8 h-8 text-status-delisted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 class="font-semibold text-lg mb-2">Failed to Load Data</h3>
        <p class="text-light-muted dark:text-dark-muted mb-4">{{ error }}</p>
        <button @click="loadSearchIndex" class="btn-primary">
          Retry
        </button>
      </div>

      <!-- Main Content - Filters always visible -->
      <div v-else class="flex flex-col lg:flex-row gap-8">
        <!-- Filters Sidebar -->
        <aside class="lg:w-72 flex-shrink-0">
          <div class="sticky top-24">
            <SearchFilters
              :filters="filters"
              :counts="counts"
              @update:filters="filters = $event"
              @clear="clearFilters"
            />
          </div>
        </aside>

        <!-- Results -->
        <main class="flex-1 min-w-0">
          <!-- Results Header -->
          <div class="flex items-center justify-between mb-6">
            <p class="text-sm text-light-muted dark:text-dark-muted">
              <span class="font-semibold text-light-text dark:text-dark-text">
                {{ filteredEntities.length.toLocaleString() }}
              </span>
              {{ filteredEntities.length === 1 ? 'result' : 'results' }}
              <span v-if="hasActiveFilters">(filtered)</span>
              <span v-if="loading" class="ml-2 text-brand-primary">
                (loading...)
              </span>
            </p>
          </div>

          <!-- Results Grid -->
          <div v-if="paginatedEntities.length > 0" class="grid sm:grid-cols-2 gap-4">
            <EntityCard
              v-for="entity in paginatedEntities"
              :key="entity.id"
              :entity="entity"
            />
          </div>

          <!-- Load More -->
          <div v-if="hasMoreResults" class="mt-8 text-center">
            <button
              @click="loadMore"
              class="btn-secondary"
            >
              Load More ({{ (filteredEntities.length - loadedCount).toLocaleString() }} more)
            </button>
          </div>

          <!-- No Results -->
          <div v-else class="glass-card p-12 text-center">
            <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-light-surface dark:bg-dark-surface flex items-center justify-center">
              <svg class="w-8 h-8 text-light-muted dark:text-dark-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 class="font-semibold text-lg mb-2">No results found</h3>
            <p class="text-light-muted dark:text-dark-muted mb-6 max-w-md mx-auto">
              No entities match your current search criteria. Try adjusting your filters or search terms.
            </p>
            <button @click="clearFilters" class="btn-primary">
              Clear all filters
            </button>
          </div>
        </main>
      </div>
    </div>
  </div>
</template>
