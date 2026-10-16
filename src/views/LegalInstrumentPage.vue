<script setup lang="ts">
import { formatCivilDate } from '@/utils/civilDate.js'
import { ref, computed, watch, onUnmounted } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import Badge from '@/components/atoms/Badge.vue'
import SourceDocuments from '@/components/molecules/SourceDocuments.vue'
import { getLanguageName } from '@/utils/language'
import { normalizeNode, toNodeIri } from '@/utils/normalizeNode'
import { nodeDocumentPath, nodeDocumentLabel } from '@/utils/nodeDocuments'
import { createLatestLoadGuard } from '@/utils/latestLoad'
import { safeExternalUrl } from '@/utils/externalUrl'
import { mapWithPool } from '@/utils/entryFetchPool'
import { legalBasisIris } from '@/utils/legalBasisAdapters'

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
  entry_ids?: string[]
  announcement_title?: string
  entity_count?: number
  effective_date?: string
  notes?: string
}

interface SanctionEntry {
  id: string
  legal_bases?: unknown
  entity_id?: string
  legal_citations?: Array<{
    legal_instrument_id?: string
    articles?: string[]
  }>
}

const instrument = ref<LegalInstrument | null>(null)
const relatedGroups = ref<SanctionGroup[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const relationshipsLoading = ref(false)
const relationshipFailures = ref(0)
const relationshipGuard = createLatestLoadGuard()
let currentPage = () => false
const loadGuard = createLatestLoadGuard()
onUnmounted(() => { loadGuard.invalidate(); relationshipGuard.invalidate() })

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
const formatDate = (dateStr?: string): string => formatCivilDate(dateStr)

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

// Scan in bounded phases so nested pools cannot multiply concurrency.
// Primary legal text is already visible while these optional links resolve.
const loadRelatedSanctions = async (instrumentId: string, pageIsCurrent: () => boolean) => {
  const latestRelationships = relationshipGuard.begin()
  const isCurrent = () => pageIsCurrent() && latestRelationships()
  relatedGroups.value = []
  relationshipFailures.value = 0
  relationshipsLoading.value = true
  try {
    const response = await fetch(`${import.meta.env.BASE_URL || '/'}api/v1/node/group/index.jsonld`)
    if (!isCurrent()) return
    if (!response.ok) throw new Error('Group index unavailable')
    const index = await response.json()
    if (!isCurrent()) return
    if (!Array.isArray(index.nodes)) throw new Error('Group index unavailable')
    const groups = await mapWithPool(index.nodes as Array<{ '@id'?: string }>, async node => {
      if (!isCurrent()) return null
      try {
        const iri = toNodeIri(node['@id'], 'group')
        if (!iri) return null
        const href = nodeDocumentPath('group', getGroupRef(iri), import.meta.env.BASE_URL || '/')
        if (!href) return null
        const response = await fetch(href)
        if (!response.ok) return null
        return await response.json() as SanctionGroup
      } catch { return null }
    })
    if (!isCurrent()) return
    relationshipFailures.value = index.nodes.length - groups.length
    const jobs = groups.flatMap(group => (Array.isArray(group.entry_ids) ? group.entry_ids : []).map(id => ({ id, group })))
    const matches = await mapWithPool(jobs, async ({ id, group }) => {
      if (!isCurrent()) return null
      try {
        const iri = toNodeIri(id, 'entry')
        if (!iri) throw new Error('Unresolvable listing')
        const response = await fetch(`${import.meta.env.BASE_URL || '/'}api/v1/node/${iri.replace('https://www.ammitto.org/', '')}.jsonld`)
        if (!response.ok) throw new Error('Listing unavailable')
        const entry = normalizeNode<SanctionEntry>(await response.json())
        if (!entry) throw new Error('Listing unavailable')
        const cited = entry.legal_citations?.some(citation => toNodeIri(citation.legal_instrument_id, 'legal-instrument') === instrumentId)
        return cited || legalBasisIris([entry]).includes(instrumentId) ? group : null
      } catch {
        if (isCurrent()) relationshipFailures.value += 1
        return null
      }
    })
    if (!isCurrent()) return
    relatedGroups.value = [...new Map(matches.map(group => [group.id, group])).values()]
  } catch {
    if (isCurrent()) relationshipFailures.value += 1
  } finally {
    if (isCurrent()) relationshipsLoading.value = false
  }
}
const retryRelationships = () => {
  if (instrument.value) void loadRelatedSanctions(instrument.value['@id'], currentPage)
}

const loadInstrument = async (id: string) => {
  const isCurrent = loadGuard.begin()
  currentPage = isCurrent
  relationshipGuard.invalidate()
  relationshipsLoading.value = false
  relationshipFailures.value = 0
  instrument.value = null
  relatedGroups.value = []
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
      loading.value = false
      if (data) void loadRelatedSanctions(data['@id'], isCurrent)
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
}
watch(sourceId, loadInstrument, { immediate: true })

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
        <button type="button" class="mt-4 text-brand-link underline" @click="loadInstrument(sourceId)">Retry legal instrument</button>
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
              v-if="safeExternalUrl(instrument.url)"
              :href="safeExternalUrl(instrument.url) as string"
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

        <div role="status" class="text-sm text-light-muted dark:text-dark-muted">
          <p v-if="relationshipsLoading">Finding related sanction groups… The legal text is ready to read.</p>
          <p v-else-if="relationshipFailures">Related sanctions are incomplete: {{ relationshipFailures }} {{ relationshipFailures === 1 ? 'record' : 'records' }} could not be loaded.</p>
          <p v-else-if="relatedGroups.length === 0">No related sanction groups were found in the published group records.</p>
          <button v-if="!relationshipsLoading && relationshipFailures" type="button" class="mt-2 text-brand-link underline" @click="retryRelationships">Retry related sanctions</button>
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
