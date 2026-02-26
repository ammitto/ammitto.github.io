import { ref, computed } from 'vue'
import FlexSearch from 'flexsearch'

// Entity interface matching JSON-LD structure
export interface SanctionEntity {
  id: string
  names: Array<{
    fullName: string
    isPrimary: boolean
  }>
  entityType: 'person' | 'organization' | 'vessel' | 'aircraft'
  source: string
  sourceReference?: string
  country?: string
  birthDate?: string
  remarks?: string
  contact?: string
  addresses?: Array<{
    street?: string
    city?: string
    state?: string
    country?: string
    postalCode?: string
  }>
}

// JSON-LD graph entity
interface JsonLdEntity {
  '@id': string
  '@type': string
  entityType: string
  names: Array<{
    '@type': string
    fullName: string
    isPrimary: boolean
  }>
  sourceReferences?: Array<{
    '@type': string
    sourceCode: string
    referenceNumber: string
  }>
  source?: string
  sourceReference?: string
  country?: string
  birthDate?: string
  birthInfo?: Array<{
    date?: string
    country?: string
  }>
  remarks?: string
  contact?: string
  addresses?: Array<{
    '@type': string
    street?: string
    city?: string
    state?: string
    country?: string
    postalCode?: string
  }>
}

interface JsonLdResponse {
  '@context': string
  '@graph': JsonLdEntity[]
}

interface StatsResponse {
  exported_at: string
  sources: Record<string, { entities: number; entries: number }>
  totals: { entities: number; entries: number }
  entityTypes?: Record<string, number>
}

// Cache for loaded data
const sourceDataCache = ref<Map<string, SanctionEntity[]>>(new Map())
const loadingStates = ref<Map<string, boolean>>(new Map())
const errorStates = ref<Map<string, string | null>>(new Map())
const stats = ref<StatsResponse | null>(null)
const statsLoading = ref(false)

// FlexSearch index for fast text search
// Using Index (simpler) instead of Document for better TypeScript support
const searchIndex = new FlexSearch.Index({
  tokenize: 'forward',
  cache: true,
})

// Entity ID to entity map for quick lookup
const entityIdList = new Map<number, string>()

// Base URL for API
const API_BASE = import.meta.env.BASE_URL || '/'

// All available sources
const ALL_SOURCES = [
  'eu', 'un', 'us', 'wb', 'uk', 'au', 'ca', 'ch', 'cn',
  'ru', 'tr', 'nz', 'jp', 'eu_vessels', 'un_vessels'
]

/**
 * Transform JSON-LD entity to internal format
 */
function transformEntity(entity: JsonLdEntity): SanctionEntity {
  // Get source from sourceReferences or fallback to source property
  const sourceRef = entity.sourceReferences?.[0]
  const source = sourceRef?.sourceCode || entity.source?.toLowerCase() || 'unknown'
  const refNumber = sourceRef?.referenceNumber || entity.sourceReference

  // Get country from addresses or birthInfo
  const country = entity.country ||
    entity.addresses?.[0]?.country ||
    entity.birthInfo?.[0]?.country

  // Get birth date from birthInfo
  const birthDate = entity.birthDate || entity.birthInfo?.[0]?.date

  return {
    id: entity['@id'],
    names: entity.names || [],
    entityType: entity.entityType as SanctionEntity['entityType'],
    source,
    sourceReference: refNumber,
    country,
    birthDate,
    remarks: entity.remarks,
    contact: entity.contact,
    addresses: entity.addresses?.map(addr => ({
      street: addr.street,
      city: addr.city,
      state: addr.state,
      country: addr.country,
      postalCode: addr.postalCode,
    })),
  }
}

/**
 * Load stats from API (small file, load immediately)
 */
async function loadStats(): Promise<StatsResponse | null> {
  if (stats.value) return stats.value

  statsLoading.value = true

  try {
    const response = await fetch(`${API_BASE}api/v1/stats.json`)

    if (!response.ok) {
      throw new Error(`Failed to load stats: ${response.status}`)
    }

    stats.value = await response.json()
    return stats.value
  } catch (e) {
    console.error('Failed to load stats:', e)
    return null
  } finally {
    statsLoading.value = false
  }
}

/**
 * Check if a source is loaded
 */
function isSourceLoaded(source: string): boolean {
  return sourceDataCache.value.has(source)
}

/**
 * Load entities from a specific source
 */
async function loadSourceEntities(source: string): Promise<SanctionEntity[]> {
  const cacheKey = source

  // Check cache first
  if (sourceDataCache.value.has(cacheKey)) {
    return sourceDataCache.value.get(cacheKey)!
  }

  // Check if already loading
  if (loadingStates.value.get(cacheKey)) {
    // Wait for current load to complete
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (!loadingStates.value.get(cacheKey)) {
          clearInterval(checkInterval)
          resolve(sourceDataCache.value.get(cacheKey) || [])
        }
      }, 100)
    })
  }

  loadingStates.value.set(cacheKey, true)
  errorStates.value.set(cacheKey, null)

  try {
    const response = await fetch(`${API_BASE}api/v1/sources/${source}.jsonld`)

    if (!response.ok) {
      throw new Error(`Failed to load ${source} data: ${response.status}`)
    }

    const data: JsonLdResponse = await response.json()

    // Filter only entities (not SanctionEntry)
    const entityTypes = ['PersonEntity', 'OrganizationEntity', 'VesselEntity', 'AircraftEntity']
    const entities = data['@graph']
      .filter(item => entityTypes.includes(item['@type']))
      .map(transformEntity)

    sourceDataCache.value.set(cacheKey, entities)

    // Index entities for fast search
    indexEntities(entities)

    return entities
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : 'Failed to load data'
    errorStates.value.set(cacheKey, errorMsg)
    console.error(`Failed to load ${source} entities:`, e)
    return []
  } finally {
    loadingStates.value.set(cacheKey, false)
  }
}

/**
 * Load multiple sources at once
 */
async function loadSources(sources: string[]): Promise<SanctionEntity[]> {
  const results = await Promise.all(sources.map(s => loadSourceEntities(s)))
  return results.flat()
}

/**
 * Load all entities (only if needed)
 */
async function loadAllEntities(): Promise<SanctionEntity[]> {
  // Load any sources not yet loaded
  const sourcesToLoad = ALL_SOURCES.filter(s => !sourceDataCache.value.has(s))

  if (sourcesToLoad.length > 0) {
    await loadSources(sourcesToLoad)
  }

  // Combine all loaded entities
  const allEntities: SanctionEntity[] = []
  for (const source of ALL_SOURCES) {
    const entities = sourceDataCache.value.get(source)
    if (entities) {
      allEntities.push(...entities)
    }
  }

  return allEntities
}

/**
 * Get all currently loaded entities
 */
function getLoadedEntities(): SanctionEntity[] {
  const allEntities: SanctionEntity[] = []
  for (const [, entities] of sourceDataCache.value) {
    allEntities.push(...entities)
  }
  return allEntities
}

/**
 * Build searchable text for an entity
 */
function buildSearchText(entity: SanctionEntity): string {
  const parts: string[] = []

  // Add all names
  for (const name of entity.names) {
    parts.push(name.fullName)
  }

  // Add country
  if (entity.country) parts.push(entity.country)

  // Add source reference
  if (entity.sourceReference) parts.push(entity.sourceReference)

  // Add remarks (truncated to avoid huge index)
  if (entity.remarks) parts.push(entity.remarks.slice(0, 500))

  return parts.join(' ')
}

/**
 * Index entities for fast search
 */
let entityIdCounter = 0
function indexEntities(entities: SanctionEntity[]): void {
  for (const entity of entities) {
    const idx = entityIdCounter++
    entityIdList.set(idx, entity.id)
    searchIndex.add(idx, buildSearchText(entity))
  }
}

/**
 * Search entities by query using FlexSearch with fallback to simple text search
 */
function searchEntities(entities: SanctionEntity[], query: string): SanctionEntity[] {
  const searchTerm = query.trim()

  if (!searchTerm) return entities

  // First try FlexSearch index
  const results = searchIndex.search(searchTerm, 1000) as number[]

  // Build a set of matched entity IDs from FlexSearch
  const matchedIds = new Set<string>()
  for (const idx of results) {
    const entityId = entityIdList.get(idx)
    if (entityId) matchedIds.add(entityId)
  }

  // If we have FlexSearch matches, use them
  if (matchedIds.size > 0) {
    return entities.filter(e => matchedIds.has(e.id))
  }

  // Fallback: simple text search on passed entities
  // This handles cases where entities haven't been indexed yet (e.g., in tests)
  const lowerQuery = searchTerm.toLowerCase()
  return entities.filter(entity => {
    // Search in all names
    for (const name of entity.names) {
      if (name.fullName.toLowerCase().includes(lowerQuery)) {
        return true
      }
    }
    // Search in country
    if (entity.country?.toLowerCase().includes(lowerQuery)) {
      return true
    }
    // Search in source reference
    if (entity.sourceReference?.toLowerCase().includes(lowerQuery)) {
      return true
    }
    return false
  })
}

/**
 * Filter entities by criteria
 */
function filterEntities(
  entities: SanctionEntity[],
  filters: {
    sources?: string[]
    entityTypes?: string[]
  }
): SanctionEntity[] {
  let result = entities

  // Filter by source
  if (filters.sources && filters.sources.length > 0) {
    result = result.filter(e =>
      filters.sources!.includes(e.source.toLowerCase())
    )
  }

  // Filter by entity type
  if (filters.entityTypes && filters.entityTypes.length > 0) {
    result = result.filter(e =>
      filters.entityTypes!.includes(e.entityType)
    )
  }

  return result
}

/**
 * Composable for accessing sanctions data with lazy loading
 */
export function useSanctionsData() {
  // Computed from loaded data
  const entities = computed(() => getLoadedEntities())

  const isLoading = computed(() => {
    for (const [, loading] of loadingStates.value) {
      if (loading) return true
    }
    return false
  })

  const error = computed(() => {
    for (const [, err] of errorStates.value) {
      if (err) return err
    }
    return null
  })

  const entityCount = computed(() => {
    if (stats.value) {
      return stats.value.totals.entities
    }
    return entities.value.length
  })

  const sourceCounts = computed(() => {
    // Use stats if available (more accurate)
    if (stats.value) {
      const counts: Record<string, number> = {}
      for (const [source, data] of Object.entries(stats.value.sources)) {
        counts[source] = data.entities
      }
      return counts
    }

    // Fall back to counting loaded entities
    const counts: Record<string, number> = {}
    for (const entity of entities.value) {
      const source = entity.source.toLowerCase()
      counts[source] = (counts[source] || 0) + 1
    }
    return counts
  })

  const entityTypeCounts = computed(() => {
    const counts: Record<string, number> = {}
    for (const entity of entities.value) {
      counts[entity.entityType] = (counts[entity.entityType] || 0) + 1
    }
    return counts
  })

  return {
    entities,
    loading: isLoading,
    error,
    entityCount,
    sourceCounts,
    entityTypeCounts,
    stats,
    statsLoading,
    // Data loading functions
    loadStats,
    loadAllEntities,
    loadSourceEntities,
    loadSources,
    isSourceLoaded,
    // Utility functions
    searchEntities,
    filterEntities,
    getLoadedEntities,
  }
}
