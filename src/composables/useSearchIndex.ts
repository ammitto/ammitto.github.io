import { ref, computed } from 'vue'
import FlexSearch from 'flexsearch'
import { normalizeNode } from '@/utils/normalizeNode'
import { searchRowText } from '@/utils/birthAdapters'
import { getEntityNodePath } from '@/utils/entityUrls'
import {
  filterSearchEntities,
  type SearchFilterSelection,
} from '@/utils/searchFilters'

/**
 * Lightweight search entity from search-index.json.
 *
 * Only `id`, `ref`, `type`, `names` and `status` are guaranteed: the
 * producer (the gem's SearchIndexExporter) compacts every other field
 * away when the source carries no value, and defaults `type` to "person"
 * and `status` to "active". `names` is always an array but may be empty.
 *
 * At the gem SHA this site pins, one entity yields one row per sanction
 * entry, so the same `id` can repeat. Row deduplication by entity id is
 * an unmerged upstream change (ammitto/ammitto#27); nothing here may
 * assume ids are unique until that lands and the pin moves.
 */
export interface SearchEntity {
  id: string
  ref: string // e.g., "un/KPi.066"
  // The four values the gem's transformers emit today; the producer's
  // own contract is any non-blank string, so unknown values must not be
  // a type error here.
  type: 'person' | 'organization' | 'vessel' | 'aircraft' | (string & {})
  names: string[]
  primaryName?: string
  country?: string
  regime?: string
  authority?: string
  // Which published list the entry appears on. Every live row carries one,
  // but the producer compacts absent values, and it emits the literal
  // 'unknown' for an entry it could not place — so a missing field and
  // 'unknown' are different states and must not be conflated.
  listType?: string
  status?: string
  birthYear?: string
  // Bounds of a stated span of birth years. The producer excludes the span
  // keys from the lookup that fills `birthYear`, so a span-only person has
  // NO `birthYear` at all and these are the row's only birth signal.
  birthYearFrom?: string
  birthYearTo?: string
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
const listTypeFacets = ref<FacetItem[]>([])

// Base URL for API
const API_BASE = import.meta.env.BASE_URL || '/'

// Check if running in browser
const isBrowser = typeof window !== 'undefined'

/**
 * Load the lightweight search index
 * This is much faster than loading all source JSON-LD files
 */
async function loadSearchIndex(): Promise<void> {
  if (isLoaded.value || isLoading.value) return

  // Skip during SSR/build - data will be loaded client-side
  if (!isBrowser) {
    return
  }

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
      const text = searchRowText(entity)

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
  // Skip during SSR/build
  if (!isBrowser) return

  try {
    const [authRes, regRes, typeRes, countryRes, statusRes, listTypeRes] = await Promise.all([
      fetch(`${API_BASE}api/v1/facets/authorities.json`),
      fetch(`${API_BASE}api/v1/facets/regimes.json`),
      fetch(`${API_BASE}api/v1/facets/types.json`),
      fetch(`${API_BASE}api/v1/facets/countries.json`),
      fetch(`${API_BASE}api/v1/facets/statuses.json`),
      fetch(`${API_BASE}api/v1/facets/list_types.json`),
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

    if (listTypeRes.ok) {
      const data: FacetsResponse = await listTypeRes.json()
      listTypeFacets.value = data.facets
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
  filters: SearchFilterSelection,
): SearchEntity[] {
  return filterSearchEntities(entityList, filters)
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
 * @param idOrRef - Either a ref (uk/aqd0087) or full IRI (https://www.ammitto.org/entity/uk/aqd0087)
 */
async function loadFullEntity(idOrRef: string): Promise<Record<string, unknown> | null> {
  // Skip during SSR/build
  if (!isBrowser) return null

  try {
    // getEntityNodePath extracts the ref from a full IRI itself, and is
    // the same call EntityPage makes to build the link it offers. It
    // returns null for a ref that cannot address a document -- an empty
    // or dot segment -- and there is nothing to fetch in that case.
    const path = getEntityNodePath(idOrRef, API_BASE)
    if (!path) return null

    const response = await fetch(path)

    if (!response.ok) {
      throw new Error(`Failed to load entity: ${response.status}`)
    }

    // Entity nodes arrive in the producer's JSON-LD vocabulary
    return normalizeNode(await response.json())
  } catch (e) {
    console.error(`Failed to load entity ${idOrRef}:`, e)
    return null
  }
}

/**
 * Composable for search index access
 */
export function useSearchIndex() {
  // Deliberately does NOT start loading here.
  //
  // Constructing the composable used to kick off the search index, the
  // whole corpus, on first use. `useEntityData` calls this to reach
  // `loadFullEntity`, so opening any entity page downloaded it and then
  // read nothing from it: `loadFullEntity` derives the ref from the IRI
  // and fetches that node file directly.
  //
  // The search page calls `loadSearchIndex` and `loadFacets` itself on
  // mount, so the page that needs the index still gets it, while every
  // other page stops paying for it.

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
    listTypeFacets,

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
