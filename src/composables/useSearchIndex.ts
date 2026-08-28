import { ref, computed } from 'vue'
import FlexSearch from 'flexsearch'
import { normalizeNode } from '@/utils/normalizeNode'
import { searchRowText } from '@/utils/birthAdapters'
import {
  foldForSearch,
  indexableText,
  nearestNames,
  type NearMiss,
} from '@/utils/searchEncode'
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

    // Build FlexSearch index.
    //
    // `encode` folds diacritics and splits on punctuation rather than
    // whitespace. That is what `islamsky` needs to reach "Islámský stát"
    // (0 -> 26 results, measured over this index on 2026-08-28) and what makes
    // `al-Qaida`, `al'Qaida` and `al Qaida` one pair of tokens.
    //
    // It is NOT what rescues the run-together spellings. `alqaida` 0 -> 33 and
    // `binladen` 0 -> 15 come from the glued forms `indexableText` appends to
    // the DOCUMENT below — deliberately not from the encoder, which also runs
    // on the query. Both figures are exactly the number of rows whose NAME
    // contains that string, counted directly over the live corpus. That equality
    // is the point: an earlier arrangement glued the whole joined row text and
    // returned 372 for `alqaida`, of which 339 carried no such name.
    //
    // See src/utils/searchEncode.ts for what folding deliberately does not fix:
    // `kadhafi` vs `qadhafi` is a substituted letter, which no encoder mends.
    // `suggestFor` below covers that.
    const index = new FlexSearch.Index({
      tokenize: 'forward',
      cache: true,
      encode: foldForSearch,
    })

    // Index each entity.
    //
    // `indexableText` appends the glued forms ("alqaida" for "Al-Qaida") to the
    // document only. They must never reach the query: FlexSearch encodes the
    // query with the same function and intersects the terms, so a glued query
    // token would demand a document where those two words are adjacent — which
    // measured 426 two-word queries losing results and 340 going to zero.
    data.entities.forEach((entity) => {
      // Kept as a named binding: tests/birthWiring.test.js pins the literal
      // `const text = searchRowText(entity)` here, because searchRowText is
      // what carries BOTH birth-span bounds into the indexed text and a
      // future edit must not quietly route around it.
      const text = searchRowText(entity)

      // Names only for the glue; see indexableText. Gluing the whole row text
      // reached across the join into country/regime/authority.
      index.add(
        entity.id,
        indexableText(text, entity.primaryName
          ? [entity.primaryName, ...entity.names]
          : entity.names),
      )
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
 * Every token the index holds, folded — built on first use, never on load.
 *
 * `suggestFor` is the only caller and it only runs when a search returned
 * nothing, which is rare and is already a moment the reader is waiting. Doing
 * this eagerly would add a second full pass over 61,099 rows to every visit to
 * the search page in exchange for a list most visitors never see.
 *
 * Measured on the live corpus: roughly 67k distinct tokens of length 3 or more.
 * A length-bucketed variant of this scan was tried and removed: the reachable
 * buckets still held 50-69% of the candidates, so the saving was inside
 * measurement noise while costing a second container and a constant that had
 * to stay in step with `suggestionBudget` with nothing pinning it. The memo in
 * `suggestFor` is what actually removes the repeated cost.
 */
let suggestionTokens: Set<string> | null = null

function buildSuggestionTokens(): Set<string> {
  const tokens = new Set<string>()
  for (const entity of entities.value.values()) {
    // `foldForSearch`, deliberately, not `indexableText`: a glued form is an
    // index-matching device, never a name. Built from the glued set, the
    // suggester offered "leilabadiau" (a surname glued to a country code) and
    // "1limited" as things the reader might have meant.
    for (const token of foldForSearch(searchRowText(entity))) {
      // Length 3 and up. The floor is about the CANDIDATE, not the query, and
      // an earlier version excluded length-3 tokens on the grounds that
      // `suggestionBudget` returns 0 for a three-character QUERY — a different
      // thing. A four-character query has a budget of 1 and can legitimately
      // reach a three-character name, so excluding them meant `kimm` never
      // suggested `kim` and `alii` never suggested `ali`. Below 3 the budget
      // is 0 from either side, so nothing there can ever match.
      if (token.length >= 3) tokens.add(token)
    }
  }
  return tokens
}

/**
 * The indexed names a query nearly matched.
 *
 * This exists so the empty state can stop asserting a negative. On the live
 * site `kadhafi` returned 1 result, `gaddafi` 15 and `qadhafi` 79 — three
 * spellings of one man — and nothing on the page told the reader the other
 * two existed. Against the real token set this returns, for `kadhafi`:
 * gadhafi, kaddafi, qadhafi. For a name genuinely absent from the corpus
 * ("ceausescu") it correctly returns nothing rather than inventing a lead.
 */
/** Memo key: the query AND the limit, since both shape the result. */
let lastSuggestKey: string | null = null
let lastSuggestResult: NearMiss[] = []

function suggestFor(query: string, limit = 5): NearMiss[] {
  if (!isLoaded.value || !query.trim()) return []

  // Memoized on the query string. The caller is a Vue computed, which
  // re-evaluates whenever any of its other dependencies change — a filter
  // toggle, a pagination reset — and each miss costs a pass over the candidate
  // set. Without this, changing a facet while the grid is empty rescanned tens
  // of thousands of tokens for a query that had not changed.
  const key = `${limit}\u0000${query}`
  if (key === lastSuggestKey) return lastSuggestResult

  if (suggestionTokens === null) suggestionTokens = buildSuggestionTokens()
  lastSuggestKey = key
  lastSuggestResult = nearestNames(query, suggestionTokens, limit)
  return lastSuggestResult
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
    // Extract ref from full IRI if needed, or use as-is if already a ref
    let ref = idOrRef
    if (idOrRef.startsWith('https://www.ammitto.org/entity/')) {
      ref = idOrRef.replace('https://www.ammitto.org/entity/', '')
    }

    const response = await fetch(`${API_BASE}api/v1/node/entity/${ref}.jsonld`)

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
  /**
   * When the published data was generated, as an ISO string, or ''.
   *
   * The empty state needs it: "no entity matches X" is only true as of a
   * date, and a screening result without one cannot be filed.
   */
  const generatedAt = computed(() => metadata.value?.generated || '')

  return {
    // State
    isLoading,
    isLoaded,
    error,
    totalEntities,
    sourceCount,
    generatedAt,

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
    suggestFor,
    filter,
    getEntity,
    getEntityByRef,
    loadFullEntity,

    // Direct access
    entities,
  }
}
