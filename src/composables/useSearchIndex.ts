import { ref, computed } from 'vue'
import FlexSearch from 'flexsearch'

/**
 * Lightweight search entity from search-index.json
 */
export interface SearchEntity {
  id: string
  ref: string // e.g., "un/KPi.066"
  type: 'person' | 'organization' | 'vessel' | 'aircraft'
  names: string[]
  primaryName: string
  country?: string
  regime?: string
  authority?: string
  status?: string
  birthYear?: string
  imo?: string
}

/**
 * Search index response from API
 */
interface SearchIndexResponse {
  metadata: {
    generated: string
    totalEntities: number
    sources: number
  }
  entities: SearchEntity[]
}

/**
 * Facet data from API
 */
export interface FacetItem {
  code: string
  name?: string
  count: number
  icon?: string
  color?: string
}

interface FacetsResponse {
  facets: FacetItem[]
}

// Global state
const searchIndex = ref<FlexSearch.Index | null>(null)
const entities = ref<Map<string, SearchEntity>>(new Map())
const isLoading = ref(false)
const isLoaded = ref(false)
const error = ref<string | null>(null)
const metadata = ref<SearchIndexResponse['metadata'] | null>(null)

// Facet caches
const authorityFacets = ref<FacetItem[]>([])
const regimeFacets = ref<FacetItem[]>([])
const typeFacets = ref<FacetItem[]>([])
const countryFacets = ref<FacetItem[]>([])
const statusFacets = ref<FacetItem[]>([])

// Base URL for API
const API_BASE = import.meta.env.BASE_URL || '/'

/**
 * Load the lightweight search index
 * This is much faster than loading all source JSON-LD files
 */
async function loadSearchIndex(): Promise<void> {
  if (isLoaded.value || isLoading.value) return

  isLoading.value = true
  error.value = null

  try {
    const response = await fetch(`${API_BASE}api/v1/search-index.json`)

    if (!response.ok) {
      throw new Error(`Failed to load search index: ${response.status}`)
    }

    const data: SearchIndexResponse = await response.json()
    metadata.value = data.metadata

    // Build FlexSearch index
    const index = new FlexSearch.Index({
      tokenize: 'forward',
      cache: true,
    })

    // Index each entity
    data.entities.forEach((entity) => {
      // Build searchable text
      const text = [
        ...entity.names,
        entity.country,
        entity.regime,
        entity.authority,
        entity.imo,
        entity.birthYear,
      ].filter(Boolean).join(' ')

      index.add(entity.id, text)
      entities.value.set(entity.id, entity)
    })

    searchIndex.value = index
    isLoaded.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load search index'
    console.error('Failed to load search index:', e)
  } finally {
    isLoading.value = false
  }
}

/**
 * Load facet data from API
 */
async function loadFacets(): Promise<void> {
  try {
    const [authRes, regRes, typeRes, countryRes, statusRes] = await Promise.all([
      fetch(`${API_BASE}api/v1/facets/authorities.json`),
      fetch(`${API_BASE}api/v1/facets/regimes.json`),
      fetch(`${API_BASE}api/v1/facets/types.json`),
      fetch(`${API_BASE}api/v1/facets/countries.json`),
      fetch(`${API_BASE}api/v1/facets/statuses.json`),
    ])

    if (authRes.ok) {
      const data: FacetsResponse = await authRes.json()
      authorityFacets.value = data.facets
    }

    if (regRes.ok) {
      const data: FacetsResponse = await regRes.json()
      regimeFacets.value = data.facets
    }

    if (typeRes.ok) {
      const data: FacetsResponse = await typeRes.json()
      typeFacets.value = data.facets
    }

    if (countryRes.ok) {
      const data: FacetsResponse = await countryRes.json()
      countryFacets.value = data.facets
    }

    if (statusRes.ok) {
      const data: FacetsResponse = await statusRes.json()
      statusFacets.value = data.facets
    }
  } catch (e) {
    console.error('Failed to load facets:', e)
  }
}

/**
 * Search entities by query
 */
function search(query: string, limit = 100): SearchEntity[] {
  if (!searchIndex.value || !query.trim()) {
    return Array.from(entities.value.values()).slice(0, limit)
  }

  const results = searchIndex.value.search(query, { limit }) as number[]

  return results
    .map((id) => entities.value.get(String(id)))
    .filter(Boolean) as SearchEntity[]
}

/**
 * Filter entities by criteria
 */
function filter(
  entityList: SearchEntity[],
  filters: {
    authorities?: string[]
    types?: string[]
    regimes?: string[]
    statuses?: string[]
    countries?: string[]
  }
): SearchEntity[] {
  let result = entityList

  if (filters.authorities && filters.authorities.length > 0) {
    result = result.filter((e) => e.authority && filters.authorities!.includes(e.authority))
  }

  if (filters.types && filters.types.length > 0) {
    result = result.filter((e) => filters.types!.includes(e.type))
  }

  if (filters.regimes && filters.regimes.length > 0) {
    result = result.filter((e) => e.regime && filters.regimes!.includes(e.regime))
  }

  if (filters.statuses && filters.statuses.length > 0) {
    result = result.filter((e) => e.status && filters.statuses!.includes(e.status))
  }

  if (filters.countries && filters.countries.length > 0) {
    result = result.filter((e) => e.country && filters.countries!.includes(e.country))
  }

  return result
}

/**
 * Get entity by ID
 */
function getEntity(id: string): SearchEntity | undefined {
  return entities.value.get(id)
}

/**
 * Get entity by reference (e.g., "un/KPi.066")
 */
function getEntityByRef(ref: string): SearchEntity | undefined {
  // Find entity with matching ref
  for (const entity of entities.value.values()) {
    if (entity.ref === ref) {
      return entity
    }
  }
  return undefined
}

/**
 * Load full entity data from node file
 */
async function loadFullEntity(ref: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`${API_BASE}api/v1/node/entity/${ref}.jsonld`)

    if (!response.ok) {
      throw new Error(`Failed to load entity: ${response.status}`)
    }

    return await response.json()
  } catch (e) {
    console.error(`Failed to load entity ${ref}:`, e)
    return null
  }
}

/**
 * Composable for search index access
 */
export function useSearchIndex() {
  // Load data on first use
  if (!isLoaded.value && !isLoading.value) {
    loadSearchIndex()
    loadFacets()
  }

  const totalEntities = computed(() => metadata.value?.totalEntities || 0)
  const sourceCount = computed(() => metadata.value?.sources || 0)

  return {
    // State
    isLoading,
    isLoaded,
    error,
    totalEntities,
    sourceCount,

    // Facets
    authorityFacets,
    regimeFacets,
    typeFacets,
    countryFacets,
    statusFacets,

    // Methods
    loadSearchIndex,
    loadFacets,
    search,
    filter,
    getEntity,
    getEntityByRef,
    loadFullEntity,

    // Direct access
    entities,
  }
}
