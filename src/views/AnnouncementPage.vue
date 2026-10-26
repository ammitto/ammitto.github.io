<script setup lang="ts">
import { formatCivilDate } from '@/utils/civilDate.js'
import { ref, computed, reactive, watch, onUnmounted } from 'vue'
import { useRoute } from '@/utils/navigation'
import Badge from '@/components/atoms/Badge.vue'
import EntityCard from '@/components/molecules/EntityCard.vue'
import SourceDocuments from '@/components/molecules/SourceDocuments.vue'
import { sources } from '@/config'
import { getLanguageName } from '@/utils/language'
import { normalizeNode, toNodeIri } from '@/utils/normalizeNode'
import { nodeDocumentPath, nodeDocumentLabel } from '@/utils/nodeDocuments'
import { createLatestLoadGuard } from '@/utils/latestLoad'
import { safeExternalUrl } from '@/utils/externalUrl'
import { primaryNameOf } from '@/utils/entityNames'
import { mapWithPool } from '@/utils/entryFetchPool'

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
  announcement_title?: string
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
const relationshipsLoading = ref(false)
const entryFailures = ref(0)
const entityFailures = ref(0)
const relatedFailures = ref(0)
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
  // Delegated, but the id-derived fallback below is kept: it reads better than
  // the word "Unknown", which is why primaryNameOf returns null rather than
  // baking a placeholder in.
  const named = primaryNameOf(entry.entity?.names)
  if (named) return named
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
    entityType: entry.entity?.entity_type || 'unknown',
    source: source,
    status: entry.status || 'unknown',
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
const formatDate = (dateStr?: string): string => formatCivilDate(dateStr)

// Get language display name (imported from shared utility)
// getLanguageName is imported from '@/utils/language'

// Optional labels and legal titles never gate the announcement's own text.
const loadRelatedData = async (isCurrent: () => boolean) => {
  const ann = announcement.value?.announcement
  if (!ann) return
  const requests = [
    ...[...new Set([ann.document_type].filter((id): id is string => !!id))].map(id => ({ kind: 'document-type', id, cache: documentTypes })),
    ...[...new Set([ann.authority, ann.signatory, ann.publisher].filter((id): id is string => !!id))].map(id => ({ kind: 'organization', id, cache: organizations })),
  ]
  await mapWithPool(requests, async ({ kind, id, cache }) => {
    if (!isCurrent() || cache[id]) return null
    try {
      const href = nodeDocumentPath(kind as 'document-type' | 'organization', id, import.meta.env.BASE_URL || '/')
      if (!href) throw new Error('Unresolvable reference')
      const response = await fetch(href)
      if (!response.ok) throw new Error('Label unavailable')
      const data = await response.json()
      if (isCurrent()) cache[id] = data
    } catch { if (isCurrent()) relatedFailures.value += 1 }
    return null
  })
}

const loadAnnouncement = async (id: string) => {
  const isCurrent = loadGuard.begin()
  announcement.value = null
  group.value = null
  entries.value = []
  legalInstruments.value = new Map()
  loading.value = true
  relationshipsLoading.value = false
  entryFailures.value = 0
  entityFailures.value = 0
  relatedFailures.value = 0
  error.value = null
  const [source, docId] = id.split('/')
  try {
    const href = nodeDocumentPath('group', source && docId ? `${source}/${docId}` : '', import.meta.env.BASE_URL || '/')
    if (!href) throw new Error('Announcement not found')
    const response = await fetch(href)
    if (!isCurrent()) return
    if (!response.ok) throw new Error('Announcement unavailable. Try again.')
    const data: Group = await response.json()
    if (!isCurrent()) return
    group.value = data
    loading.value = false
    relationshipsLoading.value = true
    const references = Array.isArray(data.entry_ids) ? data.entry_ids : []
    let primaryIndex = Infinity
    const loaded = await mapWithPool(references, async (raw, index) => {
      if (!isCurrent()) return null
      const iri = toNodeIri(raw, 'entry')
      if (!iri) return null
      try {
        const response = await fetch(`${import.meta.env.BASE_URL || '/'}api/v1/node/${iri.replace('https://www.ammitto.org/', '')}.jsonld`)
        if (!response.ok || !isCurrent()) return null
        const entry = normalizeNode<Entry>(await response.json())
        if (!isCurrent()) return null
        // Publish text before identity/title requests. Prefer source order
        // even when a later entry arrives before the first one.
        if (entry?.announcement && index < primaryIndex) {
          primaryIndex = index
          announcement.value = entry
        }
        return entry
      } catch { return null }
    })
    if (!isCurrent()) return
    entries.value = loaded
    entryFailures.value = references.length - loaded.length
    const identities = new Map<string, Entity>()
    const entityIds = [...new Set(loaded.map(entry => entry.entity_id))]
    await mapWithPool(entityIds, async id => {
      if (!isCurrent()) return null
      const iri = toNodeIri(id, 'entity')
      try {
        if (!iri) throw new Error('Unresolvable identity')
        const response = await fetch(`${import.meta.env.BASE_URL || '/'}api/v1/node/${iri.replace('https://www.ammitto.org/', '')}.jsonld`)
        if (!response.ok) throw new Error('Identity unavailable')
        const identity = normalizeNode<Entity>(await response.json())
        if (!identity) throw new Error('Identity unavailable')
        identities.set(id, identity)
      } catch { /* Count missing identities after the pool settles. */ }
      return null
    })
    if (!isCurrent()) return
    entries.value = loaded.map(entry => ({ ...entry, entity: identities.get(entry.entity_id) }))
    entityFailures.value = entityIds.length - identities.size
    const citations = [...new Set(loaded.flatMap(entry => (entry.legal_citations || []).map(citation => citation.legal_instrument_id)).filter((iri): iri is string => !!iri))]
    await mapWithPool(citations, async iri => {
      if (!isCurrent()) return null
      try {
        const ref = iri.replace(/^https:\/\/www\.ammitto\.org\/(?:legal-instrument|instrument)\//, '')
        const href = nodeDocumentPath('legal-instrument', ref, import.meta.env.BASE_URL || '/')
        if (!href) throw new Error('Unresolvable instrument')
        const response = await fetch(href)
        if (!response.ok) throw new Error('Instrument unavailable')
        const instrument = await response.json()
        if (isCurrent()) legalInstruments.value.set(iri, instrument)
      } catch { if (isCurrent()) relatedFailures.value += 1 }
      return null
    })
    if (isCurrent()) await loadRelatedData(isCurrent)
  } catch (e) {
    if (isCurrent()) error.value = e instanceof Error ? e.message : 'Announcement unavailable. Try again.'
  } finally {
    if (isCurrent()) { loading.value = false; relationshipsLoading.value = false }
  }
}
watch(sourceId, loadAnnouncement, { immediate: true })

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
      <a
        href="/browse"
        class="inline-flex items-center gap-2 text-light-muted dark:text-dark-muted hover:text-brand-link mb-6"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Browse
      </a>

      <div v-if="loading" class="glass-card p-8 text-center">
        <div class="w-8 h-8 border-2 border-brand-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p class="mt-4 text-light-muted dark:text-dark-muted">Loading announcement...</p>
      </div>

      <div v-else-if="error" role="alert" class="glass-card p-8 text-center">
        <h3 class="font-semibold text-lg mb-2">Error</h3>
        <p class="text-light-muted dark:text-dark-muted">{{ error }}</p>
        <button type="button" class="mt-4 text-brand-link underline" @click="loadAnnouncement(sourceId)">Retry announcement</button>
      </div>

      <article v-else class="space-y-6">
        <!-- Header -->
        <div class="glass-card p-8">
          <Badge variant="source" :source-code="sourceInfo?.code" class="mb-4">
            {{ sourceInfo?.name }}
          </Badge>

          <h1 class="text-2xl font-bold text-light-fg dark:text-dark-fg mb-4">
            {{ announcement?.announcement?.title || group?.announcement_title || `Announcement ${sourceId}` }}
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
                <a
                  :href="`/document-type/${announcement.announcement.document_type}`"
                  class="text-brand-link hover:underline"
                >
                  {{ getDocumentTypeName(announcement.announcement.document_type) }}
                </a>
              </dd>
            </div>
            <div v-if="announcement?.announcement?.authority">
              <dt class="text-light-muted dark:text-dark-muted">Authority</dt>
              <dd class="font-medium">
                <a
                  :href="`/organization/${announcement.announcement.authority}`"
                  class="text-brand-link hover:underline"
                >
                  {{ getOrganizationName(announcement.announcement.authority) }}
                </a>
              </dd>
            </div>
            <div v-if="announcement?.announcement?.signatory && announcement.announcement.signatory !== announcement.announcement.authority">
              <dt class="text-light-muted dark:text-dark-muted">Signatory</dt>
              <dd class="font-medium">
                <a
                  :href="`/organization/${announcement.announcement.signatory}`"
                  class="text-brand-link hover:underline"
                >
                  {{ getOrganizationName(announcement.announcement.signatory) }}
                </a>
              </dd>
            </div>
            <div v-if="announcement?.announcement?.publisher && announcement.announcement.publisher !== announcement.announcement.authority && announcement.announcement.publisher !== announcement.announcement.signatory">
              <dt class="text-light-muted dark:text-dark-muted">Publisher</dt>
              <dd class="font-medium">
                <a
                  :href="`/organization/${announcement.announcement.publisher}`"
                  class="text-brand-link hover:underline"
                >
                  {{ getOrganizationName(announcement.announcement.publisher) }}
                </a>
              </dd>
            </div>
          </dl>

          <a
            v-if="safeExternalUrl(announcement?.announcement?.url)"
            :href="safeExternalUrl(announcement?.announcement?.url) as string"
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

        <div role="status" class="text-sm text-light-muted dark:text-dark-muted">
          <p v-if="relationshipsLoading">{{ announcement ? 'Loading related records…' : 'Loading announcement text and related records…' }}</p>
          <p v-else-if="entryFailures || entityFailures || relatedFailures">This page is incomplete: {{ entryFailures }} listing {{ entryFailures === 1 ? 'record' : 'records' }}, {{ entityFailures }} {{ entityFailures === 1 ? 'identity' : 'identities' }} and {{ relatedFailures }} supporting {{ relatedFailures === 1 ? 'reference' : 'references' }} could not be loaded.</p>
          <p v-else-if="!announcement">No announcement text is available in this group's listing records.</p>
          <button v-if="!relationshipsLoading && (entryFailures || entityFailures || relatedFailures)" type="button" class="mt-2 text-brand-link underline" @click="loadAnnouncement(sourceId)">Retry related records</button>
        </div>

        <!-- Full Text -->
        <div v-if="announcement?.announcement?.content" class="glass-card p-8">
          <h2 class="text-xl font-semibold mb-4 text-light-fg dark:text-dark-fg">
            Full Announcement Text
          </h2>
          <p :lang="announcement.announcement.language || undefined" class="text-light-muted dark:text-dark-muted whitespace-pre-wrap break-words">{{ announcement.announcement.content }}</p>
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
                  <a
                    v-if="citation.legal_instrument_id && !citation.legal_instrument_id.includes('/unknown')"
                    :href="`/legal-instrument/${citation.legal_instrument_id.split('/').slice(-2).join('/')}`"
                    class="font-medium text-brand-link hover:underline"
                  >
                    {{ getLegalInstrumentName(citation.legal_instrument_id) }}
                  </a>
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
