import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useSearchIndex } from './useSearchIndex'
import { normalizeNode, toNodeIri } from '@/utils/normalizeNode'
import { mapWithPool } from '@/utils/entryFetchPool'
import { selectBirthCountry } from '@/utils/birthDisplay'
import { entityBirthClaims } from '@/utils/birthAdapters'
import { roleClaims, statedGender, vesselImoNumber } from '@/utils/entityFacts'
import { entryPeriodRows, listingRemarks } from '@/utils/entryAdapters'
import { identificationTable } from '@/utils/identificationDisplay'
import type { IdentificationRecord } from '@/utils/identificationDisplay'

// Full entity interface matching new data-cn JSON-LD node structure
export interface FullEntity {
  id: string
  '@context'?: string
  entity_type: string
  names: Array<{
    full_name: string
    first_name?: string
    middle_name?: string
    last_name?: string
    script?: string
    is_primary: boolean
  }>
  remarks?: string
  sanction_entry_ids?: string[]  // Entry IRIs linking to sanction entries
  source_references?: Array<{
    source_code: string
    reference_number: string
    url?: string
    retrieved_at?: string
  }>
  linked_entities?: Array<{
    entity_id: string
    relationship_type: string
  }>
  same_as?: string[]
  // Person-specific fields
  // The producer sends `year` and both bounds as JSON numbers; the older
  // published snapshot sends strings. Both are declared, because a
  // formatter that assumed either would be wrong against live data half
  // the time while `vue-tsc` stayed green.
  birth_info?: Array<{
    date?: string
    year?: number | string
    year_range_from?: number | string
    year_range_to?: number | string
    city?: string
    region?: string
    country?: string
    country_code?: string
    circa?: boolean
  }>
  nationalities?: Array<string | { country_code?: string; country?: string }>
  gender?: string
  // Two producer fields, not one under two names. Sources fill them
  // independently and sometimes disagree, so both are declared and the
  // page reads both through `roleClaims`.
  position?: string
  title?: string
  // Vessel-specific fields. Only the IMO number, because it is the only
  // vessel attribute any published vessel carries a value for — the
  // dozen the producer emits beside it are enumerated, with why they are
  // absent here, at the top of `@/utils/entityFacts`.
  imo_number?: string
  // Organization-specific fields
  registration_number?: string
  incorporation_date?: string
  dissolution_date?: string
  legal_form?: string
  country?: string
  country_iso_code?: string
  website?: string
  sector?: string
  // Common fields
  addresses?: Array<{
    street?: string
    city?: string
    state?: string
    country?: string
    country_code?: string
    postal_code?: string
  }>
  // The producer's Identification, after normalizeNode. The `document_type`,
  // `value` and `identification` declared here since the field was added are
  // attributes Ammitto::Identification has never had, under any spelling.
  identifications?: IdentificationRecord[]
  // Declared but not rendered anywhere, on purpose. `contact_info` is a
  // real attribute of the producer's PersonEntity and OrganizationEntity,
  // so the shape belongs in this interface as a description of the
  // contract — but no transformer populates it yet, so nothing published
  // today carries it and there is nothing for a page to show. Keeping the
  // declaration without markup is the honest pairing: the field is
  // documented where a reader looks for the entity's shape, and the page
  // grows a section when there is data to put in it.
  contact_info?: {
    phone?: string[]
    email?: string[]
    website?: string[]
  }
  beneficial_owners?: Array<{ entity_id: string; relationship_type: string }>
  directors?: Array<{ entity_id: string; relationship_type: string }>
}

// Entry interface matching new data-cn format
export interface Entry {
  id: string
  entity_id: string
  authority?: string | { '@id': string }
  regime?: { '@id': string } | { code?: string; name?: string }
  effects?: Array<{
    effect_type?: string
    scope?: string
    // Producer data carries either a localized array or a plain string
    // (seen live on wb debarment records); templates must guard both.
    description?: Array<{
      value: string
      lang: string
      script?: string
      is_primary?: boolean
    }> | string
  }>
  reasons?: Array<{
    category?: string
    description?: Array<{
      value: string
      lang: string
      script?: string
      is_primary?: boolean
    }> | string
  }>
  period?: {
    effective_date?: string
    listed_date?: string
    expiry_date?: string
    is_indefinite?: boolean
    last_updated?: string
  }
  status?: string
  reference_number?: string
  announcement?: {
    title?: string
    url?: string
    publish_date?: string
    publish_time?: string
    document_type?: string
    document_id?: string
    signatory?: string
    signatory_title?: string
    publisher?: string
    authority?: string
    content?: string
    language?: string
  }
  legal_citations?: Array<{
    legal_instrument_id?: string
    articles?: string[]
  }>
  raw_source_data?: {
    source_format?: string
    source_specific_fields?: Record<string, string>
  }
  // What the LISTING says about itself, which is not what the entity's own
  // `remarks` says about the subject. Both are published; the page reads
  // both and keeps them apart.
  remarks?: string
}

const API_BASE = import.meta.env.BASE_URL || '/'

// Published node IRIs are rooted here; entry references that are not are
// not resolvable against the API tree
const ENTITY_IRI_BASE = 'https://www.ammitto.org/'

export function useEntityData() {
  const route = useRoute()
  const { loadFullEntity, loadSearchIndex, isLoaded, isLoading } = useSearchIndex()

  const entity = ref<FullEntity | null>(null)
  const entries = ref<Entry[]>([])
  const entityLoading = ref(false)
  const entityError = ref<string | null>(null)

  const loadEntity = async (ref: string) => {
    entityLoading.value = true
    entityError.value = null
    entries.value = []

    try {
      // Ensure search index is loaded (for ref lookup)
      if (!isLoaded.value && !isLoading.value) {
        await loadSearchIndex()
      }

      // Try to load full entity from node file
      const data = await loadFullEntity(ref)

      if (data) {
        entity.value = data as unknown as FullEntity

        // Load entry data for this entity (contains effects, period, announcement, etc.)
        await loadEntries()
      } else {
        entityError.value = 'Entity not found'
      }
    } catch (e) {
      entityError.value = e instanceof Error ? e.message : 'Failed to load entity'
    } finally {
      entityLoading.value = false
    }
  }

  // Load entries using sanction_entry_ids from the entity
  const loadEntries = async () => {
    const entryIris = entity.value?.sanction_entry_ids
    if (!Array.isArray(entryIris) || entryIris.length === 0) {
      return
    }

    // The IRI tail becomes a fetch path verbatim, so it must be a
    // resolvable entry node IRI. A non-string would otherwise be iterated
    // character by character, one bogus fetch per character.
    const iris: string[] = []
    for (const rawIri of entryIris) {
      const entryIri = toNodeIri(rawIri, 'entry')
      if (entryIri) iris.push(entryIri)
      else console.warn('Skipping unrecognised entry reference:', rawIri)
    }

    // Fetched with bounded concurrency rather than one at a time.
    //
    // This loop used to await each entry in turn, so an entity carrying n
    // entries cost n sequential round-trips. Every entity published today
    // carries exactly one entry, so no page gets faster on the current
    // data — and the entity page was never one of the two that time out.
    // Those are the organization and document-type pages, which scan the
    // whole corpus through their own separate loops and are not fixed
    // here. What this removes is the cost of a case the model allows and
    // the sources have not yet produced.
    //
    // The pool itself, including the cap and the ordering guarantee, is
    // `mapWithPool` — kept in its own module so the unit tests can run it.
    const loaded = await mapWithPool(iris, fetchEntry)
    for (const entry of loaded) {
      entries.value.push(entry)
    }
  }

  // One entry node, or null. Behaviour is unchanged from the sequential
  // version: a thrown error is warned about, a non-OK response is skipped
  // silently, and either way one unreachable entry must not empty the
  // whole list. The silent skip is pre-existing and deliberately preserved
  // here rather than fixed alongside a performance change.
  const fetchEntry = async (entryIri: string): Promise<Entry | null> => {
    try {
      // Convert IRI to API path
      // IRI: https://www.ammitto.org/entry/cn/import-export-control-list/202535-csbc-corporation-taiwan
      // Path: api/v1/node/entry/cn/import-export-control-list/202535-csbc-corporation-taiwan.jsonld
      const entryPath = `api/v1/node/${entryIri.slice(ENTITY_IRI_BASE.length)}`
      const response = await fetch(`${API_BASE}${entryPath}.jsonld`)
      if (!response.ok) return null

      // Entry nodes arrive in the producer's JSON-LD vocabulary
      return normalizeNode<Entry>(await response.json())
    } catch {
      console.warn('Failed to load entry:', entryIri)
      return null
    }
  }

  // Get primary name from entity
  const primaryName = computed(() => {
    if (!entity.value?.names?.length) return null

    const primary = entity.value.names.find(n => n.is_primary)
    return primary?.full_name || entity.value.names[0]?.full_name || 'Unknown'
  })

  // Get aliases (non-primary names)
  const aliases = computed(() => {
    if (!entity.value?.names) return []
    return entity.value.names
      .filter(n => !n.is_primary)
      .map(n => n.full_name)
  })

  // Get country from entity
  const country = computed(() => {
    if (!entity.value) return null

    // From nationalities
    if (entity.value.nationalities?.length) {
      const nat = entity.value.nationalities[0]
      if (typeof nat === 'string') return nat
      if (nat.country) return nat.country
      if (nat.country_code) return nat.country_code
    }

    // From organization country
    if (entity.value.country) return entity.value.country

    // From addresses
    if (entity.value.addresses?.length) {
      return entity.value.addresses[0].country
    }

    // From birth info: the first record that states a country, which is
    // not necessarily the first record.
    return selectBirthCountry(entity.value.birth_info)
  })

  // Get source code from entity
  const source = computed(() => {
    if (!entity.value?.source_references?.length) return null
    return entity.value.source_references[0].source_code
  })

  // Get source reference number
  const sourceReference = computed(() => {
    if (!entity.value?.source_references?.length) return null
    return entity.value.source_references[0].reference_number
  })

  // Get entity type
  const entityType = computed(() => entity.value?.entity_type || null)

  // Get remarks
  const remarks = computed(() => entity.value?.remarks || null)

  // Get addresses
  const addresses = computed(() => entity.value?.addresses || [])

  // Get entity ID from route
  const entityId = computed(() => route.params.id as string)

  // Get all effects from entries
  const effects = computed(() => {
    const allEffects: Entry['effects'] = []
    for (const entry of entries.value) {
      if (entry.effects) {
        allEffects.push(...entry.effects)
      }
    }
    return allEffects
  })

  // Every period field the entries state, each on its own labelled row.
  // Reading only the effective date left entries that carry just a listed
  // date showing no date at all.
  const periodRows = computed(() => entryPeriodRows(entries.value))

  // The listings' own remarks, kept separate from the entity's above.
  const entryRemarks = computed(() =>
    listingRemarks(entries.value, entity.value?.remarks),
  )

  // Get status from entries
  const entryStatus = computed(() => {
    for (const entry of entries.value) {
      if (entry.status) return entry.status
    }
    return 'active'
  })

  // Get list types from entry IDs (extract from path)
  const listTypes = computed(() => {
    const types: string[] = []
    for (const entry of entries.value) {
      // Extract list type from entry ID path
      // ID: https://www.ammitto.org/entry/cn/import-export-control-list/202535-csbc-corporation-taiwan
      const match = entry.id.match(/\/entry\/[^/]+\/([^/]+)\//)
      if (match) {
        types.push(match[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))
      }
    }
    return [...new Set(types)]
  })

  // Get regime names from entries (extract from @id)
  const regimes = computed(() => {
    const regimeNames: string[] = []
    for (const entry of entries.value) {
      if (entry.regime) {
        // Extract from @id like "https://www.ammitto.org/regime/cn_export_control"
        if ('@id' in entry.regime) {
          const match = entry.regime['@id']?.match(/\/regime\/(.+)$/)
          if (match) {
            // Convert regime code to display name
            const code = match[1]
            const displayName = code
              .replace(/cn_/, 'China: ')
              .replace(/_/g, ' ')
              .replace(/\b\w/g, c => c.toUpperCase())
            regimeNames.push(displayName)
          }
        } else if ('name' in entry.regime && entry.regime.name) {
          regimeNames.push(entry.regime.name)
        }
      }
    }
    return [...new Set(regimeNames)]
  })

  // Get announcements from entries
  const announcements = computed(() => {
    return entries.value
      .filter(e => e.announcement)
      .map(e => e.announcement!)
  })

  // Get all reasons from entries
  const reasons = computed(() => {
    const allReasons: Entry['reasons'] = []
    for (const entry of entries.value) {
      if (entry.reasons) {
        allReasons.push(...entry.reasons)
      }
    }
    return allReasons
  })

  // Get group IDs from entries
  const groupIds = computed(() => {
    const ids: string[] = []
    for (const entry of entries.value) {
      const gid = (entry as any).group_id
      if (gid && !ids.includes(gid)) {
        ids.push(gid)
      }
    }
    return ids
  })

  return {
    entity,
    entries,
    entityLoading,
    entityError,
    loadEntity,
    entityId,
    primaryName,
    aliases,
    country,
    source,
    sourceReference,
    entityType,
    remarks,
    addresses,
    // Entry-specific data
    effects,
    reasons,
    periodRows,
    entryRemarks,
    entryStatus,
    listTypes,
    regimes,
    announcements,
    groupIds,
    // Expose additional computed properties
    nationalities: computed(() => {
      if (!entity.value?.nationalities) return []
      return entity.value.nationalities.map(n => {
        if (typeof n === 'string') return n
        return n.country || n.country_code || ''
      }).filter(Boolean)
    }),
    identificationTable: computed(() => identificationTable(entity.value?.identifications)),
    // Both role fields, not just `position`. The page's heading named the
    // title too and nothing ever read it.
    roleClaims: computed(() => roleClaims(entity.value)),
    // Stated by the listing authority, and expanded from the one-letter
    // codes the sources publish.
    gender: computed(() => statedGender(entity.value)),
    // Indexed for search since the index existed, never shown until now.
    imoNumber: computed(() => vesselImoNumber(entity.value)),
    // Every distinct claim, not the first record's. Several records are
    // several assertions about one person, and the page shows them all.
    birthInfo: computed(() => entityBirthClaims(entity.value)),
  }
}
