import { ref, computed } from 'vue'
import FlexSearch from 'flexsearch'
import { normalizeGraph } from '@/utils/normalizeNode'
import { resolveEntityBirthFields } from '@/utils/birthAdapters'
import { ALL_SOURCES, publishesAggregate } from '@/utils/sourceCatalog'

// Entity interface matching internal format
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
  addresses?: Array<{
    street?: string
    city?: string
    state?: string
    country?: string
    postalCode?: string
  }>
}

// Actual JSON-LD graph entity format from API
interface JsonLdEntity {
  id: string
  entity_type: string
  names: Array<{
    full_name: string
    script?: string
    is_primary: boolean
  }>
  source_references?: Array<{
    source_code: string
    reference_number: string
  }>
  country?: string
  // Numbers from the producer, strings from the older snapshot — see the
  // matching note on FullEntity in useEntityData.
  birth_info?: Array<{
    date?: string
    year?: number | string
    year_range_from?: number | string
    year_range_to?: number | string
    city?: string
    region?: string
    country?: string
    circa?: boolean
  }>
  remarks?: string
  addresses?: Array<{
    street?: string
    city?: string
    state?: string
    country?: string
    country_code?: string
    postal_code?: string
  }>
  nationalities?: Array<string | { country_code?: string; country?: string }>
}

interface JsonLdResponse {
  '@context': string
  '@graph': JsonLdEntity[]
}

/**
 * `api/v1/stats.json`, the one place the site should read a count from.
 *
 * Every `total_*` key below is published by the live endpoint and was measured
 * there on 2026-08-28: entities 61,099, entries 61,099, instruments 817,
 * regimes 179, authorities 14, groups 29, document_types 35, organizations 37.
 * They are optional because the CN-only snapshot committed under
 * `public/api/v1` predates several of them, so a local render must degrade
 * rather than throw.
 *
 * The counts matter because the pages used to carry their own. `BrowsePage`
 * shipped the literal strings "6 laws", "17 groups", "7 types" and "8 orgs" —
 * true of an old China-only snapshot and wrong by up to 136x against this
 * endpoint. A displayed number with no derivation cannot stay right.
 */
interface StatsResponse {
  generated_at: string
  sources: Record<string, { entities: number; entries: number }>
  total_entities: number
  total_entries: number
  total_instruments?: number
  total_regimes?: number
  total_authorities?: number
  total_groups?: number
  total_document_types?: number
  total_organizations?: number
}

// Cache for loaded data
const sourceDataCache = ref<Map<string, SanctionEntity[]>>(new Map())
const loadingStates = ref<Map<string, boolean>>(new Map())
const errorStates = ref<Map<string, string | null>>(new Map())
const stats = ref<StatsResponse | null>(null)
const statsLoading = ref(false)

/**
 * Published per-type totals from `api/v1/facets/types.json`.
 *
 * Distinct from `entityTypeCounts`, which tallies whatever this composable has
 * managed to fetch and is therefore a progress indicator, not a corpus size.
 * The two disagreed on the live site on 2026-08-28: the browse page's own
 * tally reported "All (61,040)" and "Vessel (2,603)" while the published
 * facets reported 61,099 and 2,662. The published figure is what the deploy
 * measured; the tally is what this browser has downloaded so far.
 */
const publishedTypeCounts = ref<Record<string, number> | null>(null)

// FlexSearch index for fast text search
const searchIndex = new FlexSearch.Index({
  tokenize: 'forward',
  cache: true,
})

// Entity ID to entity map for quick lookup
const entityIdList = new Map<number, string>()

// Base URL for API
const API_BASE = import.meta.env.BASE_URL || '/'

/**
 * Transform JSON-LD entity to internal format
 */
function transformEntity(entity: JsonLdEntity, sourceCode: string): SanctionEntity {
  // Get source from sourceReferences or use passed sourceCode
  const sourceRef = entity.source_references?.[0]
  const source = sourceRef?.source_code || sourceCode
  const refNumber = sourceRef?.reference_number

  // Country (its existing fallback chain) and birth date, resolved by two
  // separate scans over the birth records — see birthAdapters.
  const { country, birthDate } = resolveEntityBirthFields(entity)

  // Transform names to internal format
  const names = entity.names?.map(n => ({
    fullName: n.full_name,
    isPrimary: n.is_primary,
  })) || []

  return {
    id: entity.id,
    names,
    entityType: entity.entity_type as SanctionEntity['entityType'],
    source,
    sourceReference: refNumber,
    country,
    birthDate,
    remarks: entity.remarks,
    addresses: entity.addresses?.map(addr => ({
      street: addr.street,
      city: addr.city,
      state: addr.state,
      country: addr.country,
      postalCode: addr.postal_code,
    })),
  }
}

/**
 * Load stats from API
 */
async function loadStats(): Promise<StatsResponse | null> {
  // Both halves must be present to count as loaded. Returning early on
  // `stats.value` alone meant a transient failure of `facets/types.json` was
  // permanent for the session: stats cached, the facet map left null, and
  // every later call short-circuited before it could retry. The browse chips
  // then silently fell back to counting downloaded rows for the rest of the
  // visit, which is the very substitution this change exists to stop.
  if (stats.value && publishedTypeCounts.value) return stats.value

  statsLoading.value = true

  try {
    if (!stats.value) {
      const response = await fetch(`${API_BASE}api/v1/stats.json`)

      if (!response.ok) {
        throw new Error(`Failed to load stats: ${response.status}`)
      }

      stats.value = await response.json()
    }

    // Same run, same publication: fetched here so a caller cannot end up
    // holding a corpus total from one source and per-type totals from another.
    try {
      const typeRes = await fetch(`${API_BASE}api/v1/facets/types.json`)
      if (typeRes.ok) {
        const body = await typeRes.json()
        const map: Record<string, number> = Object.create(null)
        for (const facet of body.facets || []) {
          if (typeof facet?.code === 'string' && typeof facet.count === 'number') {
            map[facet.code] = facet.count
          }
        }
        publishedTypeCounts.value = map
      }
    } catch (e) {
      // A missing facet file must not cost the caller its stats; the views
      // fall back to their own tally and say so.
      console.error('Failed to load type facets:', e)
    }

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
  // A source with no aggregate published has nothing to request, so the
  // request is not made. The guard sits here rather than in the callers
  // because this is the only function that fetches, so every entry point
  // — including the exported ones this repo does not yet call — is
  // covered by it.
  //
  // Nothing is cached on this path: `isSourceLoaded` keeps meaning "there
  // is data for this source", which stays false while none is served.
  if (!publishesAggregate(source)) {
    return []
  }

  const cacheKey = source

  // Check cache first
  if (sourceDataCache.value.has(cacheKey)) {
    return sourceDataCache.value.get(cacheKey)!
  }

  // Check if already loading
  if (loadingStates.value.get(cacheKey)) {
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

    // The aggregate graph holds entity and entry nodes in the producer's
    // JSON-LD vocabulary; entries carry no names and are dropped here
    const nodes = normalizeGraph<JsonLdEntity>(data['@graph'])

    // Transform all entities in the graph
    const entities = nodes
      .filter(e => typeof e.id === 'string' && e.id.includes('/entity/'))
      .map(e => transformEntity(e, source))

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
 * Load all entities
 */
async function loadAllEntities(): Promise<SanctionEntity[]> {
  const sourcesToLoad = ALL_SOURCES.filter(s => !sourceDataCache.value.has(s))

  if (sourcesToLoad.length > 0) {
    await loadSources(sourcesToLoad)
  }

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

  for (const name of entity.names) {
    parts.push(name.fullName)
  }

  if (entity.country) parts.push(entity.country)
  if (entity.sourceReference) parts.push(entity.sourceReference)
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
 * Search entities by query
 */
function searchEntities(entities: SanctionEntity[], query: string): SanctionEntity[] {
  const searchTerm = query.trim()

  if (!searchTerm) return entities

  const results = searchIndex.search(searchTerm, 1000) as number[]

  const matchedIds = new Set<string>()
  for (const idx of results) {
    const entityId = entityIdList.get(idx)
    if (entityId) matchedIds.add(entityId)
  }

  if (matchedIds.size > 0) {
    return entities.filter(e => matchedIds.has(e.id))
  }

  // Fallback: simple text search
  const lowerQuery = searchTerm.toLowerCase()
  return entities.filter(entity => {
    for (const name of entity.names) {
      if (name.fullName.toLowerCase().includes(lowerQuery)) {
        return true
      }
    }
    if (entity.country?.toLowerCase().includes(lowerQuery)) return true
    if (entity.sourceReference?.toLowerCase().includes(lowerQuery)) return true
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

  if (filters.sources && filters.sources.length > 0) {
    result = result.filter(e =>
      filters.sources!.includes(e.source.toLowerCase())
    )
  }

  if (filters.entityTypes && filters.entityTypes.length > 0) {
    result = result.filter(e =>
      filters.entityTypes!.includes(e.entityType)
    )
  }

  return result
}

/**
 * Composable for accessing sanctions data
 */
export function useSanctionsData() {
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

  /**
   * The source codes whose aggregate actually failed to load.
   *
   * `loadSourceEntities` catches every fetch/parse failure, records it here and
   * returns [], so a partial register is otherwise indistinguishable from a
   * complete one — on a sanctions list, the same class of defect as a false
   * negative in search.
   *
   * Driven by recorded errors rather than by comparing the assembled row count
   * against `stats.total_entities`. That arithmetic looks equivalent and is
   * not: `loadSources` deliberately SKIPS the codes in
   * `SOURCES_WITHOUT_AGGREGATE`, so on the live site the assembled list is
   * 61,040 against a published 61,099 — a 59-row gap that is exactly
   * un_vessels, skipped by design rather than failed. A count-difference check
   * would therefore have cried failure on every visit.
   */
  const failedSources = computed(() => {
    const failed: string[] = []
    for (const [key, err] of errorStates.value) {
      if (err) failed.push(key)
    }
    return failed
  })

  const entityCount = computed(() => {
    if (stats.value) {
      return stats.value.total_entities
    }
    return entities.value.length
  })

  const sourceCounts = computed(() => {
    if (stats.value) {
      const counts: Record<string, number> = {}
      for (const [source, data] of Object.entries(stats.value.sources)) {
        counts[source] = data.entities
      }
      return counts
    }

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

  /**
   * How many sources the published data actually contains.
   *
   * Deliberately derived from `stats.sources` rather than from
   * `config.sources.length`. The two disagree: the catalogue names 15 sources
   * because `sourceCatalog.ts` keeps a source listed while its data repo is
   * still pending (`ru`), and the deploy publishes an aggregate for 14. The
   * site used to print both — the home hero said "14 Sources" while the same
   * page said "15 official sources" four screens down, and /search said
   * "Search across 14 data sources" directly above a filter panel headed
   * "Sources (15)".
   *
   * The catalogue count is the right answer to "what does Ammitto know about";
   * this is the right answer to "what can you search today", which is what
   * every one of those strings was claiming.
   */
  const publishedSourceCount = computed(() =>
    stats.value ? Object.keys(stats.value.sources).length : 0,
  )

  /** When the published data was generated, ISO string, or ''. */
  const generatedAt = computed(() => stats.value?.generated_at || '')

  return {
    entities,
    loading: isLoading,
    error,
    entityCount,
    publishedSourceCount,
    generatedAt,
    sourceCounts,
    entityTypeCounts,
    stats,
    statsLoading,
    publishedTypeCounts,
    failedSources,
    loadStats,
    loadAllEntities,
    loadSourceEntities,
    loadSources,
    isSourceLoaded,
    searchEntities,
    filterEntities,
    getLoadedEntities,
  }
}
