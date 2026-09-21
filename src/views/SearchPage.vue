<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter, type LocationQueryValue } from 'vue-router'
import SearchInput from '@/components/atoms/SearchInput.vue'
import Badge from '@/components/atoms/Badge.vue'
import EntityCard from '@/components/molecules/EntityCard.vue'
import SearchFilters from '@/components/organisms/SearchFilters.vue'
import { useScrollAnimation } from '@/composables/useScrollAnimation'
import { useSearchIndex, type SearchEntity } from '@/composables/useSearchIndex'
import { boundedEditDistance, foldForSearch } from '@/utils/searchEncode'
import { normalizeSourceCode, listTypes } from '@/config'
import { searchRowToCard } from '@/utils/birthAdapters'

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
  listTypes: [] as string[],
  statuses: [] as string[],
})

// Pagination
const PAGE_SIZE = 50
const loadedCount = ref(PAGE_SIZE)

// Load data from lightweight search index
const {
  isLoading: loading,
  isLoaded,
  error,
  totalEntities: entityCount,
  sourceCount,
  authorityFacets,
  typeFacets,
  listTypeFacets,
  statusFacets,
  generatedAt,
  loadSearchIndex,
  loadFacets,
  search,
  suggestFor,
  filter,
} = useSearchIndex()

// Query params arrive as string | null | (string | null)[] — or
// undefined when absent; keep only non-blank string entries and drop
// duplicates so null, empty and whitespace-only forms (?type, ?type=%20)
// never leak into filters or back into the canonicalized URL. Trimming
// precedes the blank test and the dedup: " " is truthy, so untrimmed it
// would become a filter value matching no facet code, emptying the
// result set while staying in the URL.
const queryList = (
  value: LocationQueryValue | LocationQueryValue[] | undefined,
) =>
  [...new Set(
    (Array.isArray(value) ? value : [value])
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.trim())
      .filter((v) => v !== ''),
  )]

// Load data on mount
onMounted(async () => {
  // Initialize from URL params
  const { q, source, type, list, status } = route.query
  const [firstQuery] = queryList(q)
  if (firstQuery) searchQuery.value = firstQuery
  // Parse unconditionally: null/empty scalar forms (?source) must also
  // reach the filters so the watcher below canonicalizes them away.
  // Normalize legacy hyphenated codes (eu-vessels -> eu_vessels) so old
  // bookmarks keep filtering; de-duplicate after normalization so mixed
  // legacy/canonical forms collapse to one entry.
  filters.value.sources = [...new Set(
    queryList(source).map(normalizeSourceCode),
  )]
  filters.value.entityTypes = queryList(type)
  // No legacy-spelling map here, unlike sources: `?list=` ships with this
  // change, so no bookmark can carry an older form of these codes.
  filters.value.listTypes = queryList(list)
  filters.value.statuses = queryList(status)

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
  if (filters.value.listTypes.length > 0) query.list = filters.value.listTypes
  if (filters.value.statuses.length > 0) query.status = filters.value.statuses
  router.replace({ query })
}, { deep: true })

// Transform SearchEntity format for EntityCard
const entityAdapter = (entity: SearchEntity) => searchRowToCard(entity)

// Filtered results with debounced search
/**
 * The indexed names a fruitless query nearly matched.
 *
 * Only computed once the index has loaded, the search has settled and it found
 * nothing — so a half-loaded index never produces suggestions, and never
 * produces the empty state either (see the template).
 */
const nearMisses = computed(() => {
  // Keyed to the DEBOUNCED query, not the live one. `suggestFor` scans tens of
  // thousands of candidates (67,417 on the live corpus) and, on its first call,
  // folds all 61,099 rows to build them. Off `searchQuery` that ran
  // synchronously inside a render on every keystroke while the grid was empty,
  // which is exactly when someone is still typing a name.
  if (!isLoaded.value || loading.value) return []
  if (!debouncedQuery.value.trim()) return []
  if (filteredEntities.value.length > 0) return []
  // Only when the SPELLING is what emptied the grid. With a facet filter
  // active, a query that matches plenty of entities can still show nothing,
  // and offering a different spelling then sends the reader chasing a
  // misspelling that was never the problem.
  if (hasFacetFilters.value) return []
  return suggestFor(debouncedQuery.value)
})

const searchInputRef = ref<{ focus: () => void } | null>(null)

/**
 * The query with only the misspelt word swapped for the suggestion.
 *
 * Replacing the whole query threw away every other word: a reader who typed
 * "bashar assadd" and clicked "assad" was left searching "assad" alone —
 * 69 results instead of the one person they were narrowing towards. The
 * suggester works per token, so the repair is per token too.
 */
function applySuggestionText(token: string): string {
  const words = debouncedQuery.value.trim().split(/\s+/).filter(Boolean)
  if (words.length <= 1) return token

  // Swap the word closest to the suggestion BY EDIT DISTANCE, measured on the
  // FOLDED form of each word — the same metric and the same normalisation
  // `nearestNames` used to produce the suggestion.
  //
  // Both halves matter. A common-prefix heuristic looks equivalent to edit
  // distance and is not: for "qa kadhafi" suggesting "qadhafi", "qa" shares two
  // leading characters and "kadhafi" shares none, so it swapped the wrong word.
  // And comparing the RAW word is wrong too, because the suggestion is folded
  // while the word is not: "bashar al-assadd" measures "al-assadd" against
  // "assad" with the hyphen and particle still attached, inflating the distance
  // of the word that actually needs replacing.
  let bestIndex = 0
  let bestDistance = Infinity
  words.forEach((w, i) => {
    // Compare against each of the word's own tokens and keep the closest.
    // Concatenating them first is not equivalent: "al-assadd" folds to
    // ["al", "assadd"], and "assadd" is one edit from "assad" while the joined
    // "alassadd" is three — the same distance as "bashar", so a tie was
    // resolved in favour of the wrong word and the query became
    // "assad al-assadd".
    for (const part of foldForSearch(w)) {
      const d = boundedEditDistance(part, token, part.length + token.length)
      if (d !== null && d < bestDistance) {
        bestDistance = d
        bestIndex = i
      }
    }
  })
  const next = words.slice()
  next[bestIndex] = token
  return next.join(' ')
}

function applySuggestion(token: string): void {
  searchQuery.value = applySuggestionText(token)
  // The button lives inside the card this replaces, so it is about to be
  // unmounted; without moving focus first the browser drops it to <body> and
  // a keyboard user restarts from the top of the document.
  searchInputRef.value?.focus?.()
}

/**
 * The single sentence a screen reader is told when a search settles.
 *
 * Composed rather than scattered. Two separate live regions — one on the count,
 * one on the empty-state card — announce the same event twice; a live region on
 * the count alone says "0 results" and withholds the scope, the date and the
 * near misses, which are the whole reason the empty state is worth reading.
 * Empty while the index is loading, so nothing is asserted before it is known.
 */
const resultAnnouncement = computed(() => {
  if (!isLoaded.value || loading.value) return ''
  const n = filteredEntities.value.length
  if (n > 0) return `${n.toLocaleString()} ${n === 1 ? 'result' : 'results'}`
  const scope = `No match. No entity on the ${sourceCount.value} lists Ammitto covers matches`
  const subject = debouncedQuery.value.trim()
    ? `"${debouncedQuery.value.trim()}"`
    : 'the current filters'
  const dated = asOf.value ? ` Data as of ${asOf.value}.` : ''
  const alt = nearMisses.value.length
    ? ` Did you mean ${nearMisses.value.map((m) => m.token).join(', ')}?`
    : ''
  return `${scope} ${subject}.${dated}${alt}`
})

/**
 * The date the answer is good as of, formatted for a reader.
 *
 * A negative screening result that carries no date cannot be filed, and this
 * page's job is to produce exactly that answer.
 */
const asOf = computed(() => {
  if (!generatedAt.value) return ''
  const d = new Date(generatedAt.value)
  if (Number.isNaN(d.getTime())) return ''
  // Formatted in UTC, the zone the timestamp is actually in. Rendered in the
  // viewer's zone, an instant near midnight UTC prints as the previous or next
  // day depending on where the reader sits — so two analysts would file the
  // same screening result under different dates.
  return d.toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
})

const filteredEntities = computed(() => {
  // Get search results - use very high limit to include all entities for filtering
  let results = search(debouncedQuery.value, 100000) // Get all results for filtering

  // Apply filters
  results = filter(results, {
    authorities: filters.value.sources.length > 0 ? filters.value.sources : undefined,
    types: filters.value.entityTypes.length > 0 ? filters.value.entityTypes : undefined,
    listTypes: filters.value.listTypes.length > 0 ? filters.value.listTypes : undefined,
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

// Count per category for filter badges (use facets when available).
// Null-prototype accumulators: the keys are facet codes read straight out
// of api/v1/facets/*.json, so on a plain {} a code of `__proto__` would
// assign to the prototype rather than create an own property — the count
// vanishes and reads return Object.prototype.
const counts = computed(() => {
  const sourceCountsMap: Record<string, number> = Object.create(null)
  const typeCountsMap: Record<string, number> = Object.create(null)
  const listTypeCountsMap: Record<string, number> = Object.create(null)
  const statusCountsMap: Record<string, number> = Object.create(null)

  // Use facets for source counts (more accurate)
  for (const facet of authorityFacets.value) {
    sourceCountsMap[facet.code] = facet.count
  }

  // Use facets for entity type counts
  for (const facet of typeFacets.value) {
    typeCountsMap[facet.code] = facet.count
  }

  // Use facets for list type counts
  for (const facet of listTypeFacets.value) {
    listTypeCountsMap[facet.code] = facet.count
  }

  // Use facets for status counts
  for (const facet of statusFacets.value) {
    statusCountsMap[facet.code] = facet.count
  }

  return {
    sources: sourceCountsMap,
    entityTypes: typeCountsMap,
    listTypes: listTypeCountsMap,
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
    listTypes: [],
    statuses: [],
  }
}

const hasActiveFilters = computed(() =>
  searchQuery.value ||
  filters.value.sources.length > 0 ||
  filters.value.entityTypes.length > 0 ||
  filters.value.listTypes.length > 0 ||
  filters.value.statuses.length > 0
)

/**
 * Whether any FACET filter is set, ignoring the query itself.
 *
 * Distinct from `hasActiveFilters`, which counts `searchQuery` as a filter so
 * that the "1 filter active / Clear all" affordance appears for a bare search.
 * The empty state needs the other question: saying "no entity matches X with
 * the current filters" when the only filter IS X reads as though something
 * else were also narrowing the result, and invites the reader to go looking
 * for a filter that is not there.
 */
const hasFacetFilters = computed(() =>
  filters.value.sources.length > 0 ||
  filters.value.entityTypes.length > 0 ||
  filters.value.listTypes.length > 0 ||
  filters.value.statuses.length > 0
)

const activeFilterCount = computed(() =>
  (searchQuery.value ? 1 : 0) +
  filters.value.sources.length +
  filters.value.entityTypes.length +
  filters.value.listTypes.length +
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

// List types have no computed here: their labels come from `@/config`,
// imported above and used directly by the template. The three families
// above can take the facet's own `name` because it matches what the
// sidebar renders; for list types it does not — the producer title-cases
// the code, so the facet would label `sdn-list` "Sdn List" in the chip
// while the sidebar pill reads "SDN List". One source of names avoids that.
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
              ref="searchInputRef"
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
                v-for="code in filters.listTypes"
                :key="'list-' + code"
                variant="default"
                class="cursor-pointer"
                @click="filters.listTypes = filters.listTypes.filter(l => l !== code)"
              >
                {{ listTypes.find(l => l.code === code)?.name || code }}
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
          <!--
            The one live region on this page. Visually hidden because the same
            facts are already on screen; announced as a single sentence so a
            screen-reader user hears the outcome, its scope, its date and any
            near misses together rather than a bare "0 results".
          -->
          <p class="sr-only" role="status" aria-live="polite">
            {{ resultAnnouncement }}
          </p>

          <!-- Results Header -->
          <div class="flex items-center justify-between mb-6">
            <!--
              The count is the result of the search, so it is what a screen
              reader needs told. Previously only the zero-results card carried
              role="status", so a search that FOUND something announced nothing
              at all and a search that found nothing announced a negative — the
              worse half of the pair being the only half spoken.
            -->
            <!--
              Not a live region: `resultAnnouncement` above is the single one,
              and it carries the scope, the date and the near misses too. The
              count is also withheld until the index exists — rendered
              unconditionally it put a literal "0 results" into the
              vite-ssg-prerendered /search HTML, which is a false negative in
              the bytes a crawler reads.
            -->
            <p v-if="isLoaded" class="text-sm text-light-muted dark:text-dark-muted">
              <span class="font-semibold text-light-text dark:text-dark-text">
                {{ filteredEntities.length.toLocaleString() }}
              </span>
              {{ filteredEntities.length === 1 ? 'result' : 'results' }}
              <span v-if="hasActiveFilters">(filtered)</span>
              <span v-if="loading" class="ml-2 text-brand-link">
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

          <!--
            No results.

            This `v-if` used to be a `v-else`, and a `v-else` binds to the
            IMMEDIATELY PRECEDING sibling — which is the Load More block above,
            not the results grid. So the card rendered whenever there was
            nothing left to load: on the live site /search?q=mudacumura showed
            seven real results for a man sanctioned by seven authorities and
            then, underneath them, "No results found". It also rendered while
            the 20 MB index was still downloading, when the honest answer was
            "not yet known".

            The condition is therefore explicit on both counts: results are
            actually zero, AND the load has finished. On a sanctions register a
            premature or contradicted negative is the one failure that matters,
            because a reader files it as a clear.
          -->
          <div
            v-if="isLoaded && !loading && filteredEntities.length === 0"
            class="glass-card p-12 text-center"
          >
            <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-light-surface dark:bg-dark-surface flex items-center justify-center">
              <svg class="w-8 h-8 text-light-muted dark:text-dark-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 class="font-semibold text-lg mb-2">No match found</h3>

            <!--
              State the scope and the date. "Nothing matches" is only a usable
              answer if the reader can see how many lists were consulted and
              how current they were; without that it cannot be filed as a
              screening result.
            -->
            <p class="text-light-muted dark:text-dark-muted mb-4 max-w-lg mx-auto">
              <template v-if="debouncedQuery.trim()">
                No entity on the {{ sourceCount }} lists Ammitto covers matches
                <span class="font-semibold text-light-text dark:text-dark-text">&ldquo;{{ debouncedQuery.trim() }}&rdquo;</span><span v-if="hasFacetFilters"> with the current filters</span>.
              </template>
              <template v-else>
                No entity on the {{ sourceCount }} lists Ammitto covers matches the current filters.
              </template>
              <span v-if="asOf" class="block mt-1 text-sm">Data as of {{ asOf }}.</span>
            </p>

            <!--
              Near misses. A spelling variant is the common reason this card is
              on screen at all: measured on the live site, `kadhafi` returned 1
              result, `gaddafi` 15 and `qadhafi` 79, and nothing told the reader
              the other spellings existed. Absent a near miss this stays hidden
              rather than inventing a lead.
            -->
            <p
              v-if="nearMisses.length"
              class="text-light-muted dark:text-dark-muted mb-6 max-w-lg mx-auto"
            >
              Did you mean
              <template v-for="(miss, i) in nearMisses" :key="miss.token">
                <!--
                  `aria-label` because the visible text is a bare token: lifted
                  out of the sentence by a screen reader's element list, "assad"
                  alone does not say what activating it does.
                -->
                <button
                  type="button"
                  class="text-brand-link hover:underline font-medium"
                  :aria-label="`Search for ${applySuggestionText(miss.token)} instead`"
                  @click="applySuggestion(miss.token)"
                >{{ miss.token }}</button><span v-if="i < nearMisses.length - 2">, </span><span v-else-if="i === nearMisses.length - 2"> or </span>
              </template>?
            </p>

            <button v-if="hasActiveFilters" @click="clearFilters" class="btn-primary">
              Clear all filters
            </button>
          </div>
        </main>
      </div>
    </div>
  </div>
</template>
