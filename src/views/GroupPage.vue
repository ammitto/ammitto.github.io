<script setup lang="ts">
import { formatCivilDate } from '@/utils/civilDate.js'
import { ref, computed, watch, onUnmounted } from 'vue'
import { useRoute } from '@/utils/navigation'
import Badge from '@/components/atoms/Badge.vue'
import EntityCard from '@/components/molecules/EntityCard.vue'
import SourceDocuments from '@/components/molecules/SourceDocuments.vue'
import { sources } from '@/config'
import { getLanguageName } from '@/utils/language'
import { normalizeNode, toNodeIri } from '@/utils/normalizeNode'
import { nodeDocumentPath, nodeDocumentLabel } from '@/utils/nodeDocuments'
import { createLatestLoadGuard } from '@/utils/latestLoad'
import { primaryNameOf } from '@/utils/entityNames'
import { mapWithPool } from '@/utils/entryFetchPool'

const route = useRoute()

interface Entity {
  id: string
  entity_type?: string
  names?: Array<{ full_name?: string; script?: string; is_primary?: boolean }>
  remarks?: string
}

interface Entry {
  id: string
  entity_id: string
  effects?: Array<{
    effect_type?: string
    description?: Array<{ value: string; lang: string; is_primary?: boolean }>
  }>
  period?: {
    effective_date?: string
  }
  status?: string
  reasons?: Array<{
    category?: string
    description?: Array<{ value: string; lang: string; is_primary?: boolean }>
  }>
  announcement?: {
    title?: string
    language?: string
  }
}

interface Group {
  id: string
  announcement_id?: string
  announcement_title?: string
  entry_ids: string[]
  entity_count: number
  effective_date?: string
  effective_time?: string
  notes?: string
}

const group = ref<Group | null>(null)
const entries = ref<Entry[]>([])
const entities = ref<Map<string, Entity>>(new Map())
const loading = ref(true)
const error = ref<string | null>(null)
const relationshipsLoading = ref(false)
const entryFailures = ref(0)
const entityFailures = ref(0)
const loadGuard = createLatestLoadGuard()
onUnmounted(loadGuard.invalidate)

const groupId = computed(() => {
  const id = route.params.id as string
  return id
})

const sourceInfo = computed(() => {
  const code = groupId.value.split('/')[0]
  return sources.find(s => s.code === code)
})

// Extract entity ref from entity_id
const getEntityRef = (entityId: string): string => {
  return entityId.replace('https://www.ammitto.org/entity/', '')
}

// Extract announcement ref from announcement_id
const getAnnouncementRef = (announcementId: string): string => {
  return announcementId.replace('https://www.ammitto.org/announcement/', '')
}

// Get primary name from entity
const getPrimaryName = (entity?: Entity): string =>
  primaryNameOf(entity?.names) ?? 'Identity unavailable'

// Get aliases (non-primary names)
const getAliases = (entity?: Entity): string[] => {
  if (!entity?.names) return []
  return entity.names
    .filter(n => !n.is_primary && n.full_name)
    .map(n => n.full_name as string)
    .slice(0, 3)
}

// Adapt entity for EntityCard
const adaptEntityForCard = (entry: Entry) => {
  const entity = entities.value.get(entry.entity_id)
  const entityRef = getEntityRef(entry.entity_id)
  const source = entityRef.split('/')[0]

  return {
    id: entry.entity_id,
    ref: entityRef,
    names: [getPrimaryName(entity), ...getAliases(entity)],
    entityType: entity?.entity_type || 'unknown',
    source: source,
    status: entry.status || 'unknown',
  }
}

// Format date for display
const formatDate = (dateStr?: string): string => formatCivilDate(dateStr)

// Get language from first entry's announcement
const announcementLanguage = computed(() => {
  if (entries.value.length > 0 && entries.value[0].announcement?.language) {
    return entries.value[0].announcement.language
  }
  return null
})

const loadGroup = async (id: string) => {
  const isCurrent = loadGuard.begin()
  group.value = null
  entries.value = []
  entities.value = new Map()
  loading.value = true
  relationshipsLoading.value = false
  entryFailures.value = 0
  entityFailures.value = 0
  error.value = null
  const [source, docId] = id.split('/')
  try {
    const href = nodeDocumentPath('group', source && docId ? `${source}/${docId}` : '', import.meta.env.BASE_URL || '/')
    if (!href) throw new Error('Group not found')
    const response = await fetch(href)
    if (!isCurrent()) return
    if (!response.ok) throw new Error('Group unavailable. Try again.')
    const data: Group = await response.json()
    if (!isCurrent()) return
    group.value = data
    loading.value = false
    relationshipsLoading.value = true
    const references = Array.isArray(data.entry_ids) ? data.entry_ids : []
    const loaded = await mapWithPool(references, async raw => {
      if (!isCurrent()) return null
      const iri = toNodeIri(raw, 'entry')
      if (!iri) return null
      try {
        const response = await fetch(`${import.meta.env.BASE_URL || '/'}api/v1/node/${iri.replace('https://www.ammitto.org/', '')}.jsonld`)
        if (!response.ok || !isCurrent()) return null
        return normalizeNode<Entry>(await response.json())
      } catch { return null }
    })
    if (!isCurrent()) return
    entries.value = loaded
    entryFailures.value = references.length - loaded.length
    const entityIds = [...new Set(loaded.map(entry => entry.entity_id))]
    const identities = await mapWithPool(entityIds, async id => {
      if (!isCurrent()) return null
      const iri = toNodeIri(id, 'entity')
      if (!iri) return null
      try {
        const response = await fetch(`${import.meta.env.BASE_URL || '/'}api/v1/node/${iri.replace('https://www.ammitto.org/', '')}.jsonld`)
        if (!response.ok || !isCurrent()) return null
        const entity = normalizeNode<Entity>(await response.json())
        return entity ? [id, entity] as const : null
      } catch { return null }
    })
    if (!isCurrent()) return
    entities.value = new Map(identities)
    entityFailures.value = entityIds.length - identities.length
  } catch (e) {
    if (isCurrent()) error.value = e instanceof Error ? e.message : 'Group unavailable. Try again.'
  } finally {
    if (isCurrent()) { loading.value = false; relationshipsLoading.value = false }
  }
}
watch(groupId, loadGroup, { immediate: true })

// The node the route watcher fetches, offered to the reader. Split the route id the
// same way the fetch splits it, so a third segment is discarded here exactly
// as the fetch discards it.
const documents = computed(() => {
  const [source, docId] = groupId.value.split('/')
  if (!source || !docId) return []
  const base = import.meta.env.BASE_URL || '/'
  const id = `${source}/${docId}`
  const href = nodeDocumentPath('group', id, base)
  const label = nodeDocumentLabel(id)
  if (!href || !label) return []
  return [{ label, href, note: 'this group' }]
})
</script>

<template>
  <div class="min-h-screen">
    <div class="container-wide py-8">
      <!-- Back link -->
      <a
        href="/browse/groups"
        class="inline-flex items-center gap-2 text-light-muted dark:text-dark-muted hover:text-brand-link mb-6"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Groups
      </a>

      <div v-if="loading" class="glass-card p-8 text-center">
        <div class="w-8 h-8 border-2 border-brand-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p class="mt-4 text-light-muted dark:text-dark-muted">Loading group...</p>
      </div>

      <div v-else-if="error" role="alert" class="glass-card p-8 text-center">
        <h3 class="font-semibold text-lg mb-2">Error</h3>
        <p class="text-light-muted dark:text-dark-muted">{{ error }}</p>
        <button type="button" class="mt-4 text-brand-link underline" @click="loadGroup(groupId)">Retry group</button>
      </div>

      <article v-else-if="group" class="space-y-6">
        <!-- Header -->
        <div class="glass-card p-8">
          <Badge variant="source" :source-code="sourceInfo?.code" class="mb-4">
            {{ sourceInfo?.name }}
          </Badge>

          <h1 class="text-2xl font-bold text-light-fg dark:text-dark-fg mb-2">
            {{ group.announcement_title || `Sanction Group ${groupId}` }}
          </h1>

          <dl class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 text-sm">
            <div>
              <dt class="text-light-muted dark:text-dark-muted">Entities</dt>
              <dd class="font-medium text-light-fg dark:text-dark-fg">{{ group.entity_count }}</dd>
            </div>
            <div v-if="group.effective_date">
              <dt class="text-light-muted dark:text-dark-muted">Effective Date</dt>
              <dd class="font-medium text-light-fg dark:text-dark-fg">{{ formatDate(group.effective_date) }}</dd>
            </div>
            <div v-if="group.effective_time">
              <dt class="text-light-muted dark:text-dark-muted">Effective Time</dt>
              <dd class="font-medium text-light-fg dark:text-dark-fg">{{ group.effective_time }}</dd>
            </div>
            <div v-if="announcementLanguage">
              <dt class="text-light-muted dark:text-dark-muted">Original Language</dt>
              <dd class="font-medium text-light-fg dark:text-dark-fg">{{ getLanguageName(announcementLanguage) }}</dd>
            </div>
            <div v-if="group.announcement_id">
              <dt class="text-light-muted dark:text-dark-muted">Announcement</dt>
              <dd>
                <a
                  :href="`/announcement/${getAnnouncementRef(group.announcement_id)}`"
                  class="text-brand-link hover:underline"
                >
                  View Details
                </a>
              </dd>
            </div>
          </dl>
        </div>

        <div role="status" class="text-sm text-light-muted dark:text-dark-muted">
          <p v-if="relationshipsLoading">Loading listing records and identities…</p>
          <p v-else-if="entryFailures || entityFailures">This list is incomplete: {{ entryFailures }} listing {{ entryFailures === 1 ? 'record' : 'records' }} and {{ entityFailures }} {{ entityFailures === 1 ? 'identity' : 'identities' }} could not be loaded.</p>
          <p v-else-if="entries.length === 0">This group contains no listing records.</p>
          <button v-if="!relationshipsLoading && (entryFailures || entityFailures)" type="button" class="mt-2 text-brand-link underline" @click="loadGroup(groupId)">Retry related records</button>
        </div>

        <!-- Entities Grid -->
        <div>
          <h2 class="text-xl font-semibold mb-4 text-light-fg dark:text-dark-fg">
            Sanctioned Entities ({{ entries.length }})
          </h2>
          <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <EntityCard
              v-for="entry in entries"
              :key="entry.id"
              :entity="adaptEntityForCard(entry)"
            />
          </div>
        </div>

        <SourceDocuments
          subject="this group"
          :documents="documents"
        />
      </article>
    </div>
  </div>
</template>
