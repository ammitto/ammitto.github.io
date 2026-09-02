<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import Badge from '@/components/atoms/Badge.vue'
import SourceDocuments from '@/components/molecules/SourceDocuments.vue'
import { getLanguageName } from '@/utils/language'
import { normalizeNode } from '@/utils/normalizeNode'
import { nodeDocumentPath, nodeDocumentLabel } from '@/utils/nodeDocuments'
import { createLatestLoadGuard } from '@/utils/latestLoad'

const route = useRoute()

interface LocalizedTitle {
  'zh-Hans'?: string
  'en'?: string
  [key: string]: string | undefined
}

interface ListItem {
  type: 'list-item'
  label?: string
  content?: string[]
}

interface NumberedList {
  type: 'numbered-list'
  content?: ListItem[]
}

interface Clause {
  type: 'clause'
  label?: string
  content?: (string | NumberedList)[]
}

interface Chapter {
  type: 'chapter'
  label?: string
  title?: string
  content?: Clause[]
}

interface Section {
  type: 'section'
  label?: string
  title?: string
}

type ContentNode = Chapter | Clause | Section

interface LegalInstrument {
  '@id': string
  '@type'?: string
  identifier?: string
  name?: string
  title?: LocalizedTitle[] | string
  type?: string
  documentId?: string
  url?: string
  publishDate?: string
  effectiveDate?: string
  content?: ContentNode[]
  articles?: string[]
  citationType?: string
  lang?: string
}

interface SanctionGroup {
  id: string
  announcement_title?: string
  entity_count?: number
  effective_date?: string
  notes?: string
}

interface SanctionEntry {
  id: string
  entity_id?: string
  legal_citations?: Array<{
    legal_instrument_id?: string
    articles?: string[]
  }>
}

const instrument = ref<LegalInstrument | null>(null)
const relatedGroups = ref<SanctionGroup[]>([])
const relatedEntries = ref<SanctionEntry[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const loadGuard = createLatestLoadGuard()
onUnmounted(loadGuard.invalidate)

const sourceId = computed(() => {
  const id = route.params.id as string
  return id
})

// Get display title from LocalizedString array or string
const displayTitle = computed(() => {
  if (!instrument.value) return 'Legal Instrument'
  const title = instrument.value.title
  if (!title) return instrument.value.name || 'Legal Instrument'
  if (typeof title === 'string') return title
  if (Array.isArray(title)) {
    const enTitle = title.find(t => t['en'])?.['en']
    const zhTitle = title.find(t => t['zh-Hans'])?.['zh-Hans']
    return enTitle || zhTitle || instrument.value.name || 'Legal Instrument'
  }
  return instrument.value.name || 'Legal Instrument'
})

// Get Chinese title if available
const chineseTitle = computed(() => {
  if (!instrument.value?.title) return null
  const title = instrument.value.title
  if (Array.isArray(title)) {
    return title.find(t => t['zh-Hans'])?.['zh-Hans'] || null
  }
  return null
})

// Format date for display
const formatDate = (dateStr?: string): string => {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  } catch {
    return dateStr
  }
}

// Get language display name (imported from shared utility)
// getLanguageName is imported from '@/utils/language'

// Check if content is a text array (strings)
const isTextArray = (content: ContentNode[] | string[]): content is string[] => {
  return content.length > 0 && typeof content[0] === 'string'
}

// Helper to get section label and title
const getSectionLabel = (node: ContentNode): string => {
  if (node.type === 'section') {
    const section = node as Section
    return `${section.label || ''} ${section.title || ''}`.trim()
  }
  return ''
}

// Render content text (handles string arrays)
const renderContentText = (content: string[]): string => {
  return content.join(' ')
}

// Extract group ref from ID
const getGroupRef = (groupId: string): string => {
  return groupId.replace('https://www.ammitto.org/group/', '')
}

// Load related sanction groups that cite this instrument
const loadRelatedSanctions = async (instrumentId: string, isCurrent: () => boolean) => {
  try {
    // Load group index
    const groupIndexResponse = await fetch('/api/v1/node/group/index.jsonld')
    if (!isCurrent()) return
    if (!groupIndexResponse.ok) return

    const groupIndex = await groupIndexResponse.json()
    if (!isCurrent()) return
    const groupNodes = groupIndex.nodes || []

    // Check each group for entries that cite this instrument
    for (const groupNode of groupNodes) {
      if (!isCurrent()) return
      const groupRef = groupNode['@id'].replace('https://www.ammitto.org/group/', '')
      const groupResponse = await fetch(`/api/v1/node/group/${groupRef}.jsonld`)
      if (!isCurrent()) return
      if (!groupResponse.ok) continue

      const groupData = await groupResponse.json()
      if (!isCurrent()) return
      if (!groupData.entry_ids) continue

      // Check entries in this group
      for (const entryId of groupData.entry_ids) {
        if (!isCurrent()) return
        const entryRef = entryId.replace('https://www.ammitto.org/', 'api/v1/node/') + '.jsonld'
        const entryResponse = await fetch(`/${entryRef}`)
        if (!isCurrent()) return
        if (!entryResponse.ok) continue

        // Entry nodes arrive in the producer's JSON-LD vocabulary
        const entryData = normalizeNode<SanctionEntry>(await entryResponse.json())
        if (!isCurrent()) return
        if (entryData?.legal_citations) {
          const citesThisInstrument = entryData.legal_citations.some(
            (citation: { legal_instrument_id?: string }) =>
              citation.legal_instrument_id === instrumentId ||
              citation.legal_instrument_id?.includes(instrumentId.split('/').pop() || '')
          )
          if (citesThisInstrument) {
            relatedGroups.value.push(groupData)
            relatedEntries.value.push(entryData)
          }
        }
      }
    }

    // Deduplicate groups
    const seenGroupIds = new Set()
    relatedGroups.value = relatedGroups.value.filter(group => {
      if (seenGroupIds.has(group.id)) return false
      seenGroupIds.add(group.id)
      return true
    })
  } catch (e) {
    if (isCurrent()) console.error('Failed to load related sanctions:', e)
  }
}

watch(sourceId, async (id) => {
  const isCurrent = loadGuard.begin()
  instrument.value = null
  relatedGroups.value = []
  relatedEntries.value = []
  loading.value = true
  error.value = null

  try {
    const instrumentHref = nodeDocumentPath(
      'legal-instrument',
      id,
      import.meta.env.BASE_URL || '/',
    )
    if (!instrumentHref) {
      error.value = 'Legal instrument not found'
      return
    }

    const response = await fetch(instrumentHref)
    if (!isCurrent()) return
    if (response.ok) {
      const data: LegalInstrument = await response.json()
      if (!isCurrent()) return
      instrument.value = data
      // Load related sanctions
      if (data) {
        await loadRelatedSanctions(data['@id'], isCurrent)
        if (!isCurrent()) return
      }
    } else {
      error.value = 'Legal instrument not found'
    }
  } catch (e) {
    if (isCurrent()) {
      error.value = e instanceof Error ? e.message : 'Failed to load'
    }
  } finally {
    if (isCurrent()) loading.value = false
  }
}, { immediate: true })

// The node the route watcher fetches, offered to the reader. The path comes from
// `nodeDocumentPath` rather than being spelled out again here, which is what
// keeps this link and that fetch naming the same document, and is what
// validates the identifier: `/legal-instrument/:id(.*)` is catch-all, so the
// id is whatever was in the address bar.
const documents = computed(() => {
  const id = sourceId.value
  if (!id) return []
  const base = import.meta.env.BASE_URL || '/'
  const href = nodeDocumentPath('legal-instrument', id, base)
  const label = nodeDocumentLabel(id)
  if (!href || !label) return []
  return [{ label, href, note: 'this legal instrument' }]
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

      <!-- Loading state -->
      <div v-if="loading" class="flex items-center justify-center py-12">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
      </div>

      <!-- Error state -->
      <div v-else-if="error" class="text-center py-12">
        <h1 class="text-2xl font-bold text-light-fg dark:text-dark-fg mb-4">Error</h1>
        <p class="text-light-muted dark:text-dark-muted">{{ error }}</p>
      </div>

      <!-- Instrument content -->
      <div v-else-if="instrument" class="space-y-6">
        <!-- Header -->
        <div class="bg-white dark:bg-dark-card rounded-lg shadow-sm border border-light-border dark:border-dark-border p-6">
          <!-- flex-wrap + min-w-0: the "View Official Document" button below is
               shrink-0, so on a 320px screen the title and the button could not
               share one row and the header pushed the page 59px wide. -->
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="min-w-0">
              <h1 class="text-2xl font-bold text-light-fg dark:text-dark-fg mb-2">
                {{ displayTitle }}
              </h1>
              <p v-if="chineseTitle && chineseTitle !== displayTitle" class="text-lg text-light-muted dark:text-dark-muted mb-3">
                {{ chineseTitle }}
              </p>
              <div class="flex flex-wrap gap-2">
                <Badge v-if="instrument.type" variant="default">{{ instrument.type }}</Badge>
                <Badge v-if="instrument.citationType" variant="default">{{ instrument.citationType }}</Badge>
              </div>
            </div>
            <a
              v-if="instrument.url"
              :href="instrument.url"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-lg hover:bg-brand-primary/90 transition-colors shrink-0"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              View Official Document
            </a>
          </div>
        </div>

        <!-- Metadata -->
        <div class="bg-white dark:bg-dark-card rounded-lg shadow-sm border border-light-border dark:border-dark-border p-6">
          <h2 class="text-lg font-semibold text-light-fg dark:text-dark-fg mb-4">Details</h2>
          <dl class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div v-if="instrument.documentId">
              <dt class="text-sm font-medium text-light-muted dark:text-dark-muted">Document ID</dt>
              <dd class="mt-1 text-light-fg dark:text-dark-fg">{{ instrument.documentId }}</dd>
            </div>
            <div v-if="instrument.publishDate">
              <dt class="text-sm font-medium text-light-muted dark:text-dark-muted">Published Date</dt>
              <dd class="mt-1 text-light-fg dark:text-dark-fg">{{ formatDate(instrument.publishDate) }}</dd>
            </div>
            <div v-if="instrument.effectiveDate">
              <dt class="text-sm font-medium text-light-muted dark:text-dark-muted">Effective Date</dt>
              <dd class="mt-1 text-light-fg dark:text-dark-fg">{{ formatDate(instrument.effectiveDate) }}</dd>
            </div>
            <div v-if="instrument.lang">
              <dt class="text-sm font-medium text-light-muted dark:text-dark-muted">Original Language</dt>
              <dd class="mt-1 text-light-fg dark:text-dark-fg">{{ getLanguageName(instrument.lang) }}</dd>
            </div>
            <div v-if="instrument.identifier">
              <dt class="text-sm font-medium text-light-muted dark:text-dark-muted">Identifier</dt>
              <dd class="mt-1 text-light-fg dark:text-dark-fg font-mono text-sm">{{ instrument.identifier }}</dd>
            </div>
          </dl>
        </div>

        <!-- Articles cited -->
        <div v-if="instrument.articles?.length" class="bg-white dark:bg-dark-card rounded-lg shadow-sm border border-light-border dark:border-dark-border p-6">
          <h2 class="text-lg font-semibold text-light-fg dark:text-dark-fg mb-4">Articles Cited</h2>
          <div class="flex flex-wrap gap-2">
            <Badge
              v-for="article in instrument.articles"
              :key="article"
              variant="default"
            >
              {{ article }}
            </Badge>
          </div>
        </div>

        <!-- Legal Content -->
        <div v-if="instrument.content?.length" class="bg-white dark:bg-dark-card rounded-lg shadow-sm border border-light-border dark:border-dark-border p-6">
          <h2 class="text-lg font-semibold text-light-fg dark:text-dark-fg mb-6">Legal Text</h2>

          <div class="space-y-6 prose prose-sm dark:prose-invert max-w-none">
            <!-- Recursive content rendering -->
            <template v-for="(node, idx) in instrument.content" :key="idx">
              <!-- Chapter -->
              <div v-if="node.type === 'chapter'" class="chapter">
                <h3 class="text-lg font-bold text-light-fg dark:text-dark-fg border-b border-light-border dark:border-dark-border pb-2 mb-4">
                  {{ node.label }} {{ node.title }}
                </h3>
                <div v-if="node.content" class="space-y-4 pl-4">
                  <template v-for="(subNode, subIdx) in node.content" :key="subIdx">
                    <!-- Clause -->
                    <div v-if="subNode.type === 'clause'" class="clause">
                      <p class="font-semibold text-light-fg dark:text-dark-fg mb-2">{{ subNode.label }}</p>
                      <div v-if="subNode.content" class="space-y-2 text-light-fg dark:text-dark-fg">
                        <template v-for="(item, itemIdx) in subNode.content" :key="itemIdx">
                          <p v-if="typeof item === 'string'" class="leading-relaxed">{{ item }}</p>
                          <!-- Numbered list -->
                          <div v-else-if="item.type === 'numbered-list'" class="pl-4 space-y-2">
                            <template v-for="(listItem, listIdx) in item.content" :key="listIdx">
                              <div v-if="listItem.type === 'list-item'" class="flex gap-2">
                                <span class="font-medium shrink-0">{{ listItem.label }}</span>
                                <span v-if="listItem.content && isTextArray(listItem.content)">
                                  {{ renderContentText(listItem.content) }}
                                </span>
                              </div>
                            </template>
                          </div>
                        </template>
                      </div>
                    </div>
                    <!-- Section -->
                    <div v-else-if="subNode.type === 'section'" class="section py-2">
                      <h4 class="font-semibold text-light-fg dark:text-dark-fg">{{ getSectionLabel(subNode) }}</h4>
                    </div>
                  </template>
                </div>
              </div>

              <!-- Standalone clause (not in chapter) -->
              <div v-else-if="node.type === 'clause'" class="clause">
                <p class="font-semibold text-light-fg dark:text-dark-fg mb-2">{{ node.label }}</p>
                <div v-if="node.content" class="space-y-2 text-light-fg dark:text-dark-fg">
                  <template v-for="(item, itemIdx) in node.content" :key="itemIdx">
                    <p v-if="typeof item === 'string'" class="leading-relaxed">{{ item }}</p>
                  </template>
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- Identifier -->
        <div class="bg-white dark:bg-dark-card rounded-lg shadow-sm border border-light-border dark:border-dark-border p-6">
          <h2 class="text-lg font-semibold text-light-fg dark:text-dark-fg mb-4">Identifier</h2>
          <code class="block p-4 bg-light-bg dark:bg-dark-bg rounded text-sm text-light-muted dark:text-dark-muted break-all">
            {{ instrument['@id'] }}
          </code>
        </div>

        <!-- Related Sanction Groups -->
        <div v-if="relatedGroups.length > 0" class="bg-white dark:bg-dark-card rounded-lg shadow-sm border border-light-border dark:border-dark-border p-6">
          <h2 class="text-lg font-semibold text-light-fg dark:text-dark-fg mb-4">
            Related Sanction Groups ({{ relatedGroups.length }})
          </h2>
          <div class="space-y-3">
            <div
              v-for="group in relatedGroups"
              :key="group.id"
              class="p-4 bg-light-bg dark:bg-dark-bg rounded-lg border border-light-border dark:border-dark-border"
            >
              <div class="flex items-center justify-between">
                <div>
                  <RouterLink
                    :to="`/group/${getGroupRef(group.id)}`"
                    class="text-brand-link hover:underline font-medium"
                  >
                    {{ group.announcement_title || getGroupRef(group.id) }}
                  </RouterLink>
                  <p v-if="group.announcement_title" class="text-xs text-light-muted dark:text-dark-muted mt-1 font-mono">
                    {{ getGroupRef(group.id) }}
                  </p>
                  <p v-if="group.notes" class="text-sm text-light-muted dark:text-dark-muted mt-1">
                    {{ group.notes }}
                  </p>
                </div>
                <div class="text-right">
                  <div v-if="group.entity_count" class="text-sm text-light-muted dark:text-dark-muted">
                    {{ group.entity_count }} entities
                  </div>
                  <div v-if="group.effective_date" class="text-sm text-light-muted dark:text-dark-muted">
                    {{ formatDate(group.effective_date) }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <SourceDocuments
          subject="this legal instrument"
          :documents="documents"
        />
      </div>
    </div>
  </div>
</template>
