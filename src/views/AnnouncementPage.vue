<script setup lang="ts">
import { ref, computed, reactive, watch, onUnmounted } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import Badge from '@/components/atoms/Badge.vue'
import EntityCard from '@/components/molecules/EntityCard.vue'
import SourceDocuments from '@/components/molecules/SourceDocuments.vue'
import { sources } from '@/config'
import { getLanguageName } from '@/utils/language'
import { normalizeNode } from '@/utils/normalizeNode'
import { nodeDocumentPath, nodeDocumentLabel } from '@/utils/nodeDocuments'
import { createLatestLoadGuard } from '@/utils/latestLoad'

const route = useRoute()

interface Entity {
  id: string
  entity_type?: string
  names?: Array<{
    full_name?: string
    script?: string
    is_primary?: boolean
  }>
}

interface Entry {
  id: string
  entity_id: string
  entity?: Entity
  effects?: Array<{
    effect_type?: string
    scope?: string
    description?: Array<{ value: string; lang: string; script?: string; is_primary?: boolean }>
  }>
  period?: {
    effective_date?: string
  }
  status?: string
  announcement?: {
    title?: string
    document_id?: string
    document_type?: string
    publish_date?: string
    publish_time?: string
    url?: string
    authority?: string
    signatory?: string
    signatory_title?: string
    publisher?: string
    content?: string
    language?: string
  }
  legal_citations?: Array<{
    legal_instrument_id?: string
    articles?: string[]
    citation_type?: string
  }>
}

interface LegalInstrument {
  id: string
  name?: string
  title?: Array<{ 'en'?: string; 'zh-Hans'?: string }> | string
}

interface Group {
  id: string
  entry_ids: string[]
  entity_count: number
  effective_date?: string
}

const announcement = ref<Entry | null>(null)
const group = ref<Group | null>(null)
const entries = ref<Entry[]>([])
const legalInstruments = ref<Map<string, LegalInstrument>>(new Map())
const loading = ref(true)
const error = ref<string | null>(null)
const loadGuard = createLatestLoadGuard()
onUnmounted(loadGuard.invalidate)

// Cache for document types and organizations
const documentTypes = reactive<Record<string, { identifier: string; name: Array<{ value: string; lang: string }> }>>({})
const organizations = reactive<Record<string, { identifier: string; name: Array<{ value: string; lang: string }> }>>({})

const sourceId = computed(() => {
  const id = route.params.id as string
  return id
})

const sourceInfo = computed(() => {
  const code = sourceId.value.split('/')[0]
  return sources.find(s => s.code === code)
})

// Extract entity ref from entity_id
const getEntityRef = (entityId: string): string => {
  return entityId.replace('https://www.ammitto.org/entity/', '')
}

// Get primary name from entity
const getEntityPrimaryName = (entry: Entry): string => {
  if (entry.entity?.names) {
    const primary = entry.entity.names.find(n => n.is_primary)
    if (primary?.full_name) return primary.full_name
    if (entry.entity.names[0]?.full_name) return entry.entity.names[0].full_name
  }
  // Fallback: extract from entry ID
  const parts = entry.id.split('/')
  return parts[parts.length - 1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Get aliases from entity
const getEntityAliases = (entry: Entry): string[] => {
  if (!entry.entity?.names) return []
  return entry.entity.names
    .filter(n => !n.is_primary && n.full_name)
    .map(n => n.full_name as string)
    .slice(0, 3)
}

// Adapt entry for EntityCard
const adaptEntryForCard = (entry: Entry) => {
  const entityRef = getEntityRef(entry.entity_id)
  const source = entityRef.split('/')[0]

  return {
    id: entry.entity_id,
    ref: entityRef,
    names: [getEntityPrimaryName(entry), ...getEntityAliases(entry)],
    entityType: entry.entity?.entity_type || 'organization',
    source: source,
    status: entry.status || 'active',
  }
}

// Get legal instrument display name
const getLegalInstrumentName = (instrumentId: string): string => {
  const instrument = legalInstruments.value.get(instrumentId)
  if (instrument) {
    if (instrument.title) {
      if (typeof instrument.title === 'string') return instrument.title
      if (Array.isArray(instrument.title)) {
        const enTitle = instrument.title.find(t => t['en'])?.['en']
        const zhTitle = instrument.title.find(t => t['zh-Hans'])?.['zh-Hans']
        return enTitle || zhTitle || instrument.name || 'Unknown'
      }
    }
    return instrument.name || 'Unknown'
  }
  const parts = instrumentId.split('/')
  const localId = parts[parts.length - 1]
  return localId === 'unknown' ? 'Unknown Legal Instrument' : localId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Get display name for document type
const getDocumentTypeName = (id: string): string => {
  const docType = documentTypes[id]
  if (!docType?.name) return id
  const enName = docType.name.find((n: { value: string; lang: string }) => n.lang === 'en')
  const zhName = docType.name.find((n: { value: string; lang: string }) => n.lang === 'zh')
  return enName?.value || zhName?.value || id
}

// Get display name for organization
const getOrganizationName = (id: string): string => {
  const org = organizations[id]
  if (!org?.name) return id
  const enName = org.name.find((n: { value: string; lang: string }) => n.lang === 'en')
  const zhName = org.name.find((n: { value: string; lang: string }) => n.lang === 'zh')
  return enName?.value || zhName?.value || id
}

// Format date for display
const formatDate = (dateStr?: string): string => {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return dateStr
  }
}

// Get language display name (imported from shared utility)
// getLanguageName is imported from '@/utils/language'

// Load related data (document types and organizations)
const loadRelatedData = async (isCurrent: () => boolean) => {
  if (!announcement.value?.announcement) return

  const ann = announcement.value.announcement
  const idsToFetch: { docTypes: string[]; orgs: string[] } = { docTypes: [], orgs: [] }

  if (ann.document_type) idsToFetch.docTypes.push(ann.document_type)
  if (ann.authority) idsToFetch.orgs.push(ann.authority)
  if (ann.signatory) idsToFetch.orgs.push(ann.signatory)
  if (ann.publisher) idsToFetch.orgs.push(ann.publisher)

  // Fetch document types
  for (const id of idsToFetch.docTypes) {
    if (!isCurrent()) return
    if (!documentTypes[id]) {
      try {
        const response = await fetch(`/api/v1/node/document-type/${id}.jsonld`)
        if (!isCurrent()) return
        if (response.ok) {
          const data = await response.json()
          if (!isCurrent()) return
          documentTypes[id] = data
        }
      } catch {
        // Ignore errors
      }
    }
  }

  // Fetch organizations
  for (const id of idsToFetch.orgs) {
    if (!isCurrent()) return
    if (!organizations[id]) {
      try {
        const response = await fetch(`/api/v1/node/organization/${id}.jsonld`)
        if (!isCurrent()) return
        if (response.ok) {
          const data = await response.json()
          if (!isCurrent()) return
          organizations[id] = data
        }
      } catch {
        // Ignore errors
      }
    }
  }
}

watch(sourceId, async (id) => {
  const isCurrent = loadGuard.begin()
  announcement.value = null
  group.value = null
  entries.value = []
  legalInstruments.value = new Map()
  loading.value = true
  error.value = null
  const [source, docId] = id.split('/')

  try {
    const documentId = source && docId ? `${source}/${docId}` : ''
    const groupHref = nodeDocumentPath(
      'group',
      documentId,
      import.meta.env.BASE_URL || '/',
    )
    if (!groupHref) {
      error.value = 'Announcement not found'
      return
    }

    // Load the group for this announcement
    const groupResponse = await fetch(groupHref)
    if (!isCurrent()) return
    if (groupResponse.ok) {
      const groupData = await groupResponse.json()
      if (!isCurrent()) return
      group.value = groupData

      // Load all entries in the group
      if (groupData?.entry_ids) {
        for (const entryId of groupData.entry_ids) {
          const entryPath = entryId.replace('https://www.ammitto.org/', 'api/v1/node/')
          const entryResponse = await fetch(`/${entryPath}.jsonld`)
          if (!isCurrent()) return
          if (entryResponse.ok) {
            // Entry and entity nodes arrive in the producer's JSON-LD vocabulary
            const entryData = normalizeNode<Entry>(await entryResponse.json())
            if (!isCurrent()) return
            if (!entryData) continue

            // Load entity data for this entry
            if (entryData.entity_id) {
              const entityRef = entryData.entity_id.replace('https://www.ammitto.org/entity/', '')
              const entityResponse = await fetch(`/api/v1/node/entity/${entityRef}.jsonld`)
              if (!isCurrent()) return
              if (entityResponse.ok) {
                const entityData = normalizeNode<Entity>(await entityResponse.json())
                if (!isCurrent()) return
                entryData.entity = entityData ?? undefined
              }
            }

            entries.value.push(entryData)

            // Use first entry's announcement as the main announcement
            if (!announcement.value && entryData.announcement) {
              announcement.value = entryData as Entry
            }

            // Load legal instruments
            if (entryData.legal_citations) {
              for (const citation of entryData.legal_citations) {
                if (citation.legal_instrument_id && !legalInstruments.value.has(citation.legal_instrument_id)) {
                  const instrumentRef = citation.legal_instrument_id
                    .replace('https://www.ammitto.org/legal-instrument/', '')
                    .replace('https://www.ammitto.org/instrument/', '')
                  try {
                    const instrumentResponse = await fetch(`/api/v1/node/legal-instrument/${instrumentRef}.jsonld`)
                    if (!isCurrent()) return
                    if (instrumentResponse.ok) {
                      const instrumentData = await instrumentResponse.json()
                      if (!isCurrent()) return
                      legalInstruments.value.set(citation.legal_instrument_id, instrumentData)
                    }
                  } catch {
                    // Instrument file doesn't exist, skip it
                  }
                }
              }
            }
          }
        }
      }

      // Load related data (document types and organizations)
      await loadRelatedData(isCurrent)
      if (!isCurrent()) return
    } else {
      error.value = 'Announcement not found'
    }
  } catch (e) {
    if (isCurrent()) {
      error.value = e instanceof Error ? e.message : 'Failed to load'
    }
  } finally {
    if (isCurrent()) loading.value = false
  }
}, { immediate: true })

// The group node this page renders, offered to the reader. There is no
// `node/announcement/` kind — an announcement is a field on each entry, and
// the group is the only document standing for the whole of it. Split the
// route id the same way the loader splits it, so a third segment is
// discarded here exactly as the fetch discards it.
const documents = computed(() => {
  const [source, docId] = sourceId.value.split('/')
  if (!source || !docId) return []
  const base = import.meta.env.BASE_URL || '/'
  const id = `${source}/${docId}`
  const href = nodeDocumentPath('group', id, base)
  const label = nodeDocumentLabel(id)
  if (!href || !label) return []
  return [{ label, href, note: 'this announcement' }]
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

      <div v-if="loading" class="glass-card p-8 text-center">
        <div class="w-8 h-8 border-2 border-brand-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p class="mt-4 text-light-muted dark:text-dark-muted">Loading announcement...</p>
      </div>

      <div v-else-if="error" class="glass-card p-8 text-center">
        <h3 class="font-semibold text-lg mb-2">Error</h3>
        <p class="text-light-muted dark:text-dark-muted">{{ error }}</p>
      </div>

      <article v-else class="space-y-6">
        <!-- Header -->
        <div class="glass-card p-8">
          <Badge variant="source" :source-code="sourceInfo?.code" class="mb-4">
            {{ sourceInfo?.name }}
          </Badge>

          <h1 class="text-2xl font-bold text-light-fg dark:text-dark-fg mb-4">
            {{ announcement?.announcement?.title || `Announcement ${sourceId}` }}
          </h1>

          <dl class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div v-if="announcement?.announcement?.document_id">
              <dt class="text-light-muted dark:text-dark-muted">Document ID</dt>
              <dd class="font-medium text-light-fg dark:text-dark-fg">{{ announcement.announcement.document_id }}</dd>
            </div>
            <div v-if="announcement?.announcement?.publish_date">
              <dt class="text-light-muted dark:text-dark-muted">Published Date</dt>
              <dd class="font-medium text-light-fg dark:text-dark-fg">{{ formatDate(announcement.announcement.publish_date) }}</dd>
            </div>
            <div v-if="group?.effective_date">
              <dt class="text-light-muted dark:text-dark-muted">Effective Date</dt>
              <dd class="font-medium text-light-fg dark:text-dark-fg">{{ formatDate(group.effective_date) }}</dd>
            </div>
            <div v-if="group?.entity_count">
              <dt class="text-light-muted dark:text-dark-muted">Entities Sanctioned</dt>
              <dd class="font-medium text-light-fg dark:text-dark-fg">{{ group.entity_count }}</dd>
            </div>
            <div v-if="announcement?.announcement?.language">
              <dt class="text-light-muted dark:text-dark-muted">Original Language</dt>
              <dd class="font-medium text-light-fg dark:text-dark-fg">{{ getLanguageName(announcement.announcement.language) }}</dd>
            </div>
            <div v-if="announcement?.announcement?.document_type">
              <dt class="text-light-muted dark:text-dark-muted">Document Type</dt>
              <dd class="font-medium">
                <RouterLink
                  :to="`/document-type/${announcement.announcement.document_type}`"
                  class="text-brand-link hover:underline"
                >
                  {{ getDocumentTypeName(announcement.announcement.document_type) }}
                </RouterLink>
              </dd>
            </div>
            <div v-if="announcement?.announcement?.authority">
              <dt class="text-light-muted dark:text-dark-muted">Authority</dt>
              <dd class="font-medium">
                <RouterLink
                  :to="`/organization/${announcement.announcement.authority}`"
                  class="text-brand-link hover:underline"
                >
                  {{ getOrganizationName(announcement.announcement.authority) }}
                </RouterLink>
              </dd>
            </div>
            <div v-if="announcement?.announcement?.signatory && announcement.announcement.signatory !== announcement.announcement.authority">
              <dt class="text-light-muted dark:text-dark-muted">Signatory</dt>
              <dd class="font-medium">
                <RouterLink
                  :to="`/organization/${announcement.announcement.signatory}`"
                  class="text-brand-link hover:underline"
                >
                  {{ getOrganizationName(announcement.announcement.signatory) }}
                </RouterLink>
              </dd>
            </div>
            <div v-if="announcement?.announcement?.publisher && announcement.announcement.publisher !== announcement.announcement.authority && announcement.announcement.publisher !== announcement.announcement.signatory">
              <dt class="text-light-muted dark:text-dark-muted">Publisher</dt>
              <dd class="font-medium">
                <RouterLink
                  :to="`/organization/${announcement.announcement.publisher}`"
                  class="text-brand-link hover:underline"
                >
                  {{ getOrganizationName(announcement.announcement.publisher) }}
                </RouterLink>
              </dd>
            </div>
          </dl>

          <a
            v-if="announcement?.announcement?.url"
            :href="announcement.announcement.url"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-lg hover:bg-brand-primary/90 transition-colors mt-4"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            View Official Source
          </a>
        </div>

        <!-- Full Text -->
        <div v-if="announcement?.announcement?.content" class="glass-card p-8">
          <h2 class="text-xl font-semibold mb-4 text-light-fg dark:text-dark-fg">
            Full Announcement Text
          </h2>
          <p class="text-light-muted dark:text-dark-muted whitespace-pre-wrap">{{ announcement.announcement.content }}</p>
        </div>

        <!-- Sanctioned Entities Grid -->
        <div>
          <h2 class="text-xl font-semibold mb-4 text-light-fg dark:text-dark-fg">
            Sanctioned Entities ({{ entries.length }})
          </h2>
          <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <EntityCard
              v-for="entry in entries"
              :key="entry.id"
              :entity="adaptEntryForCard(entry)"
            />
          </div>
        </div>

        <!-- Legal Citations -->
        <div v-if="announcement?.legal_citations?.length" class="glass-card p-8">
          <h2 class="text-xl font-semibold mb-4 text-light-fg dark:text-dark-fg">
            Legal Citations
          </h2>
          <div class="space-y-3">
            <div
              v-for="(citation, idx) in announcement.legal_citations"
              :key="idx"
              class="p-3 bg-light-surface/50 dark:bg-dark-surface/50 rounded-lg"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="flex-1">
                  <RouterLink
                    v-if="citation.legal_instrument_id && !citation.legal_instrument_id.includes('/unknown')"
                    :to="`/legal-instrument/${citation.legal_instrument_id.split('/').slice(-2).join('/')}`"
                    class="font-medium text-brand-link hover:underline"
                  >
                    {{ getLegalInstrumentName(citation.legal_instrument_id) }}
                  </RouterLink>
                  <span v-else class="font-medium text-light-muted dark:text-dark-muted italic">
                    {{ getLegalInstrumentName(citation.legal_instrument_id || '') }}
                  </span>
                  <div v-if="citation.articles?.length" class="mt-1 text-sm text-light-muted dark:text-dark-muted">
                    Articles: {{ citation.articles.join(', ') }}
                  </div>
                </div>
                <Badge v-if="citation.citation_type" variant="default" class="text-xs">
                  {{ citation.citation_type.replace(/_/g, ' ') }}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <SourceDocuments
          subject="this announcement"
          :documents="documents"
        />
      </article>
    </div>
  </div>
</template>
