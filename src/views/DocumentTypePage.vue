<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'

const route = useRoute()

interface LocalizedName {
  value: string
  lang: string
  script: string
  isPrimary?: boolean
}

interface DocumentType {
  '@id': string
  '@type': string
  identifier: string
  name: LocalizedName[]
}

interface Entry {
  id: string
  entity_id?: string
  status?: string
  group_id?: string
  announcement?: {
    title?: string | Array<{ value: string; lang: string }>
    publish_date?: string
    document_id?: string
    url?: string
    document_type?: string
    language?: string
  }
}

interface LegalInstrument {
  '@id': string
  identifier?: string
  name?: string
  title?: Array<{ 'zh-Hans'?: string; 'en'?: string }> | string
  type?: string
  publishDate?: string
  url?: string
  lang?: string
}

const documentType = ref<DocumentType | null>(null)
const relatedEntries = ref<Entry[]>([])
const relatedInstruments = ref<LegalInstrument[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const docTypeId = computed(() => route.params.id as string)

const displayName = computed(() => {
  if (!documentType.value) return 'Document Type'
  const enName = documentType.value.name.find(n => n.lang === 'en')
  const zhName = documentType.value.name.find(n => n.lang === 'zh')
  return enName?.value || zhName?.value || 'Document Type'
})

const chineseName = computed(() => {
  if (!documentType.value) return null
  const zhName = documentType.value.name.find(n => n.lang === 'zh')
  return zhName?.value || null
})

const formatDate = (dateStr?: string): string => {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}

const getAnnouncementTitle = (entry: Entry): string => {
  if (!entry.announcement?.title) return 'Untitled'
  const title = entry.announcement.title
  if (typeof title === 'string') return title
  if (Array.isArray(title)) {
    const enTitle = title.find(t => {
      if (typeof t === 'object' && 'value' in t) return t.lang === 'en'
      if (typeof t === 'object' && 'en' in t) return true
      return false
    })
    if (enTitle && typeof enTitle === 'object') {
      if ('value' in enTitle) return enTitle.value
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ('en' in enTitle) return (enTitle as any).en
    }
  }
  return 'Untitled'
}

// Unique announcements grouped by document_id
interface UniqueAnnouncement {
  document_id: string
  title: string
  publish_date: string
  url?: string
  entity_count: number
  group_id?: string
  lang?: string
}

const uniqueAnnouncements = computed<UniqueAnnouncement[]>(() => {
  const grouped = new Map<string, UniqueAnnouncement>()

  for (const entry of relatedEntries.value) {
    const docId = entry.announcement?.document_id || 'unknown'
    if (!grouped.has(docId)) {
      grouped.set(docId, {
        document_id: docId,
        title: getAnnouncementTitle(entry),
        publish_date: entry.announcement?.publish_date || '',
        url: entry.announcement?.url,
        entity_count: 0,
        group_id: entry.group_id,
        lang: entry.announcement?.language
      })
    }
    grouped.get(docId)!.entity_count++
  }

  // Sort by date descending
  return Array.from(grouped.values()).sort((a, b) =>
    b.publish_date.localeCompare(a.publish_date)
  )
})

const getInstrumentTitle = (instrument: LegalInstrument): string => {
  if (instrument.title) {
    if (typeof instrument.title === 'string') return instrument.title
    if (Array.isArray(instrument.title)) {
      for (const t of instrument.title) {
        if (typeof t === 'object' && 'en' in t && t['en']) return t['en']
      }
      for (const t of instrument.title) {
        if (typeof t === 'object' && 'zh-Hans' in t && t['zh-Hans']) return t['zh-Hans']
      }
    }
  }
  return instrument.name || 'Untitled'
}

const getInstrumentRef = (instrumentId: string): string => {
  return instrumentId.replace('https://www.ammitto.org/legal-instrument/', '')
}

// Extract group reference from group_id IRI
const getGroupRef = (groupId?: string): string | null => {
  if (!groupId) return null
  return groupId.replace('https://www.ammitto.org/group/', '')
}

// Load entries with this document type
const loadRelatedEntries = async (docTypeIdentifier: string) => {
  try {
    // Load entry index
    const entryIndexResponse = await fetch('/api/v1/node/entry/index.jsonld')
    if (!entryIndexResponse.ok) return

    const entryIndex = await entryIndexResponse.json()
    const entryNodes = entryIndex.nodes || []

    for (const entryNode of entryNodes) {
      const entryRef = entryNode['@id'].replace('https://www.ammitto.org/entry/', '')
      const entryResponse = await fetch(`/api/v1/node/entry/${entryRef}.jsonld`)
      if (!entryResponse.ok) continue

      const entryData: Entry = await entryResponse.json()

      // Check if this entry has the matching document type
      if (entryData.announcement?.document_type === docTypeIdentifier) {
        relatedEntries.value.push(entryData)
      }
    }

    // Deduplicate
    const seen = new Set()
    relatedEntries.value = relatedEntries.value.filter(e => {
      if (seen.has(e.id)) return false
      seen.add(e.id)
      return true
    })
  } catch (e) {
    console.error('Failed to load related entries:', e)
  }
}

// Load legal instruments with this document type
const loadRelatedInstruments = async (docTypeIdentifier: string) => {
  try {
    // Load instrument index
    const instrumentIndexResponse = await fetch('/api/v1/node/legal-instrument/index.jsonld')
    if (!instrumentIndexResponse.ok) return

    const instrumentIndex = await instrumentIndexResponse.json()
    const instrumentNodes = instrumentIndex.nodes || []

    for (const instrumentNode of instrumentNodes) {
      const instrumentRef = instrumentNode['@id'].replace('https://www.ammitto.org/legal-instrument/', '')
      const instrumentResponse = await fetch(`/api/v1/node/legal-instrument/${instrumentRef}.jsonld`)
      if (!instrumentResponse.ok) continue

      const instrumentData: LegalInstrument = await instrumentResponse.json()

      // Check if this instrument has the matching type
      if (instrumentData.type === docTypeIdentifier) {
        relatedInstruments.value.push(instrumentData)
      }
    }
  } catch (e) {
    console.error('Failed to load related instruments:', e)
  }
}

onMounted(async () => {
  const id = docTypeId.value

  try {
    // Load document type
    const response = await fetch(`/api/v1/node/document-type/${id}.jsonld`)
    if (response.ok) {
      documentType.value = await response.json()
      // Load related entries and instruments
      const identifier = documentType.value?.identifier
      if (identifier) {
        await Promise.all([
          loadRelatedEntries(identifier),
          loadRelatedInstruments(identifier)
        ])
      }
    } else {
      error.value = 'Document type not found'
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="min-h-screen">
    <div class="container-wide py-8">
      <!-- Back link -->
      <RouterLink
        to="/browse/document-types"
        class="inline-flex items-center gap-2 text-light-muted dark:text-dark-muted hover:text-brand-primary mb-6"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Document Types
      </RouterLink>

      <!-- Loading state -->
      <div v-if="loading" class="flex items-center justify-center py-12">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
      </div>

      <!-- Error state -->
      <div v-else-if="error" class="text-center py-12">
        <h1 class="text-2xl font-bold text-light-fg dark:text-dark-fg mb-4">Error</h1>
        <p class="text-light-muted dark:text-dark-muted">{{ error }}</p>
      </div>

      <!-- Document type content -->
      <div v-else-if="documentType" class="space-y-6">
        <!-- Header -->
        <div class="bg-white dark:bg-dark-card rounded-lg shadow-sm border border-light-border dark:border-dark-border p-6">
          <div class="flex items-start gap-4">
            <div class="w-16 h-16 rounded-lg flex items-center justify-center text-3xl bg-orange-100 dark:bg-orange-900/30 shrink-0">
              📄
            </div>
            <div class="flex-1">
              <h1 class="text-2xl font-bold text-light-fg dark:text-dark-fg mb-1">
                {{ displayName }}
              </h1>
              <p v-if="chineseName && chineseName !== displayName" class="text-lg text-light-muted dark:text-dark-muted mb-2">
                {{ chineseName }}
              </p>
              <p class="text-sm font-mono text-light-muted dark:text-dark-muted">
                {{ documentType.identifier }}
              </p>
            </div>
          </div>
        </div>

        <!-- Legal Instruments -->
        <div v-if="relatedInstruments.length > 0" class="bg-white dark:bg-dark-card rounded-lg shadow-sm border border-light-border dark:border-dark-border p-6">
          <h2 class="text-lg font-semibold text-light-fg dark:text-dark-fg mb-4">
            Legal Instruments ({{ relatedInstruments.length }})
          </h2>
          <div class="space-y-3">
            <RouterLink
              v-for="instrument in relatedInstruments"
              :key="instrument['@id']"
              :to="`/legal-instrument/${getInstrumentRef(instrument['@id'])}`"
              class="block p-4 bg-light-bg dark:bg-dark-bg rounded-lg border border-light-border dark:border-dark-border hover:border-brand-primary/50 transition-all"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="flex-1">
                  <h3 class="font-medium text-brand-primary">
                    {{ getInstrumentTitle(instrument) }}
                  </h3>
                  <div class="flex flex-wrap gap-2 mt-2 text-sm text-light-muted dark:text-dark-muted">
                    <span v-if="instrument.identifier" class="font-mono">{{ instrument.identifier }}</span>
                    <span v-if="instrument.publishDate">{{ formatDate(instrument.publishDate) }}</span>
                  </div>
                </div>
                <svg class="w-5 h-5 text-light-muted dark:text-dark-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </RouterLink>
          </div>
        </div>

        <!-- Announcements -->
        <div v-if="uniqueAnnouncements.length > 0" class="bg-white dark:bg-dark-card rounded-lg shadow-sm border border-light-border dark:border-dark-border p-6">
          <h2 class="text-lg font-semibold text-light-fg dark:text-dark-fg mb-4">
            Announcements ({{ uniqueAnnouncements.length }})
          </h2>
          <div class="space-y-3">
            <RouterLink
              v-for="announcement in uniqueAnnouncements"
              :key="announcement.document_id"
              :to="announcement.group_id ? `/announcement/${getGroupRef(announcement.group_id)}` : '#'"
              :class="announcement.group_id ? 'cursor-pointer hover:border-brand-primary/50' : 'cursor-default'"
              class="block p-4 bg-light-bg dark:bg-dark-bg rounded-lg border border-light-border dark:border-dark-border transition-all"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="flex-1">
                  <h3 class="font-medium text-light-fg dark:text-dark-fg">
                    {{ announcement.title }}
                  </h3>
                  <div class="flex flex-wrap gap-3 mt-2 text-sm text-light-muted dark:text-dark-muted">
                    <span v-if="announcement.document_id" class="font-mono">{{ announcement.document_id }}</span>
                    <span v-if="announcement.publish_date">{{ formatDate(announcement.publish_date) }}</span>
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                      {{ announcement.entity_count }} {{ announcement.entity_count === 1 ? 'entity' : 'entities' }}
                    </span>
                  </div>
                </div>
                <svg v-if="announcement.group_id" class="w-5 h-5 text-light-muted dark:text-dark-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </RouterLink>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="uniqueAnnouncements.length === 0 && relatedInstruments.length === 0" class="bg-white dark:bg-dark-card rounded-lg shadow-sm border border-light-border dark:border-dark-border p-6 text-center">
          <p class="text-light-muted dark:text-dark-muted">
            No documents found with this document type.
          </p>
        </div>

        <!-- Identifier -->
        <div class="bg-white dark:bg-dark-card rounded-lg shadow-sm border border-light-border dark:border-dark-border p-6">
          <h2 class="text-lg font-semibold text-light-fg dark:text-dark-fg mb-4">Identifier</h2>
          <code class="block p-4 bg-light-bg dark:bg-dark-bg rounded text-sm text-light-muted dark:text-dark-muted break-all">
            {{ documentType['@id'] }}
          </code>
        </div>
      </div>
    </div>
  </div>
</template>
