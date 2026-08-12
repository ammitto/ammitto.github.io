<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import {
  organizationSummaryUrl,
  summaryList,
  toAnnouncementRows,
  type AnnouncementSummary,
  type OrganizationSummary
} from '@/utils/summarySlice'

const route = useRoute()

interface LocalizedName {
  value: string
  lang: string
  script: string
  isPrimary?: boolean
}

interface Organization {
  '@id': string
  '@type': string
  identifier: string
  name: LocalizedName[]
  type?: string
  parentId?: string
  url?: string
}

const organization = ref<Organization | null>(null)
const publishedAnnouncements = ref<AnnouncementSummary[]>([])
const signedAnnouncements = ref<AnnouncementSummary[]>([])
const authorizedAnnouncements = ref<AnnouncementSummary[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
// Distinguishes "this organization has no documents" from "the summary could
// not be read". Without it, an artifact published before these slices
// existed would render as a confident, wrong empty page.
const summaryUnavailable = ref(false)

const orgId = computed(() => route.params.id as string)

const displayName = computed(() => {
  if (!organization.value) return 'Organization'
  const enName = organization.value.name.find(n => n.lang === 'en')
  const zhName = organization.value.name.find(n => n.lang === 'zh')
  return enName?.value || zhName?.value || 'Organization'
})

const chineseName = computed(() => {
  if (!organization.value) return null
  const zhName = organization.value.name.find(n => n.lang === 'zh')
  return zhName?.value || null
})

const orgTypeLabel = computed(() => {
  if (!organization.value?.type) return ''
  const labels: Record<string, string> = {
    ministry: 'Ministry',
    department: 'Department',
    agency: 'Agency',
    committee: 'Committee',
    office: 'Office',
    working_mechanism: 'Working Mechanism',
  }
  return labels[organization.value.type] || organization.value.type
})

const getAnnouncementTitle = (announcement: AnnouncementSummary): string => {
  if (!announcement.title) return 'Untitled'
  const title = announcement.title
  if (typeof title === 'string') return title
  if (Array.isArray(title)) {
    // Handle both {value, lang} and {"zh-Hans": ..., "en": ...} formats
    const enTitle = title.find(t => {
      if (typeof t === 'object' && 'value' in t) return t.lang === 'en'
      if (typeof t === 'object' && 'en' in t) return true
      return false
    })
    if (enTitle) {
      if ('value' in enTitle) return enTitle.value
      if ('en' in enTitle) return enTitle.en
    }
    const zhTitle = title.find(t => {
      if (typeof t === 'object' && 'value' in t) return t.lang === 'zh'
      if (typeof t === 'object' && 'zh-Hans' in t) return true
      return false
    })
    if (zhTitle) {
      if ('value' in zhTitle) return zhTitle.value
      if ('zh-Hans' in zhTitle) return zhTitle['zh-Hans']
    }
  }
  return 'Untitled'
}

const toRows = (summaries: AnnouncementSummary[]) =>
  toAnnouncementRows(summaries, getAnnouncementTitle)

const uniquePublishedAnnouncements = computed(() => toRows(publishedAnnouncements.value))
const uniqueSignedAnnouncements = computed(() => toRows(signedAnnouncements.value))
const uniqueAuthorizedAnnouncements = computed(() => toRows(authorizedAnnouncements.value))

const formatDate = (dateStr?: string): string => {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}

// Extract group reference from group_id IRI
const getGroupRef = (groupId?: string): string | null => {
  if (!groupId) return null
  return groupId.replace('https://www.ammitto.org/group/', '')
}

/**
 * Load the documents this organization published, signed and authorized.
 *
 * One request. This page used to fetch the entry index and then every entry
 * node in the corpus — tens of thousands of sequential requests, so the page
 * never painted. The publishing pipeline now emits the same three lists
 * per organization, so the page reads its own summary and nothing else.
 */
const loadSummary = async (orgIdentifier: string) => {
  try {
    const response = await fetch(organizationSummaryUrl(orgIdentifier))
    if (!response.ok) {
      summaryUnavailable.value = true
      return
    }

    const summary: OrganizationSummary = await response.json()
    publishedAnnouncements.value = summaryList<AnnouncementSummary>(summary.published)
    signedAnnouncements.value = summaryList<AnnouncementSummary>(summary.signed)
    authorizedAnnouncements.value = summaryList<AnnouncementSummary>(summary.authorized)
  } catch (e) {
    summaryUnavailable.value = true
    console.error('Failed to load organization summary:', e)
  }
}

onMounted(async () => {
  const id = orgId.value

  try {
    // Load organization
    const response = await fetch(`/api/v1/node/organization/${id}.jsonld`)
    if (response.ok) {
      organization.value = await response.json()
      // Load the published summary
      if (organization.value?.identifier) {
        await loadSummary(organization.value.identifier)
      }
    } else {
      error.value = 'Organization not found'
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
        to="/browse/organizations"
        class="inline-flex items-center gap-2 text-light-muted dark:text-dark-muted hover:text-brand-primary mb-6"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Organizations
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

      <!-- Organization content -->
      <div v-else-if="organization" class="space-y-6">
        <!-- Header -->
        <div class="bg-white dark:bg-dark-card rounded-lg shadow-sm border border-light-border dark:border-dark-border p-6">
          <div class="flex items-start gap-4">
            <div class="w-16 h-16 rounded-lg flex items-center justify-center text-3xl bg-lime-100 dark:bg-lime-900/30 shrink-0">
              🏛️
            </div>
            <div class="flex-1">
              <h1 class="text-2xl font-bold text-light-fg dark:text-dark-fg mb-1">
                {{ displayName }}
              </h1>
              <p v-if="chineseName && chineseName !== displayName" class="text-lg text-light-muted dark:text-dark-muted mb-2">
                {{ chineseName }}
              </p>
              <div class="flex flex-wrap gap-2">
                <span v-if="orgTypeLabel" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                  {{ orgTypeLabel }}
                </span>
              </div>
            </div>
            <a
              v-if="organization.url"
              :href="organization.url"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-lg hover:bg-brand-primary/90 transition-colors shrink-0"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Official Website
            </a>
          </div>
        </div>

        <!-- Metadata -->
        <div class="bg-white dark:bg-dark-card rounded-lg shadow-sm border border-light-border dark:border-dark-border p-6">
          <h2 class="text-lg font-semibold text-light-fg dark:text-dark-fg mb-4">Details</h2>
          <dl class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <dt class="text-sm font-medium text-light-muted dark:text-dark-muted">Identifier</dt>
              <dd class="mt-1 text-light-fg dark:text-dark-fg font-mono text-sm">{{ organization.identifier }}</dd>
            </div>
            <div v-if="organization.parentId">
              <dt class="text-sm font-medium text-light-muted dark:text-dark-muted">Parent Organization</dt>
              <dd class="mt-1 text-light-fg dark:text-dark-fg">{{ organization.parentId }}</dd>
            </div>
          </dl>
        </div>

        <!-- Summary unavailable -->
        <div v-if="summaryUnavailable" class="bg-white dark:bg-dark-card rounded-lg shadow-sm border border-light-border dark:border-dark-border p-6 text-center">
          <p class="text-light-muted dark:text-dark-muted">
            Document lists are unavailable for this organization right now.
          </p>
        </div>

        <!-- Documents Published -->
        <div v-if="uniquePublishedAnnouncements.length > 0" class="bg-white dark:bg-dark-card rounded-lg shadow-sm border border-light-border dark:border-dark-border p-6">
          <h2 class="text-lg font-semibold text-light-fg dark:text-dark-fg mb-4">
            Documents Published ({{ uniquePublishedAnnouncements.length }})
          </h2>
          <div class="space-y-3">
            <RouterLink
              v-for="announcement in uniquePublishedAnnouncements"
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
                      {{ announcement.entry_count }} {{ announcement.entry_count === 1 ? 'entity' : 'entities' }}
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

        <!-- Documents Signed -->
        <div v-if="uniqueSignedAnnouncements.length > 0" class="bg-white dark:bg-dark-card rounded-lg shadow-sm border border-light-border dark:border-dark-border p-6">
          <h2 class="text-lg font-semibold text-light-fg dark:text-dark-fg mb-4">
            Documents Signed ({{ uniqueSignedAnnouncements.length }})
          </h2>
          <div class="space-y-3">
            <RouterLink
              v-for="announcement in uniqueSignedAnnouncements"
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
                      {{ announcement.entry_count }} {{ announcement.entry_count === 1 ? 'entity' : 'entities' }}
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

        <!-- Documents Authorized -->
        <div v-if="uniqueAuthorizedAnnouncements.length > 0" class="bg-white dark:bg-dark-card rounded-lg shadow-sm border border-light-border dark:border-dark-border p-6">
          <h2 class="text-lg font-semibold text-light-fg dark:text-dark-fg mb-4">
            Documents Authorized ({{ uniqueAuthorizedAnnouncements.length }})
          </h2>
          <div class="space-y-3">
            <RouterLink
              v-for="announcement in uniqueAuthorizedAnnouncements"
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
                      {{ announcement.entry_count }} {{ announcement.entry_count === 1 ? 'entity' : 'entities' }}
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

        <!-- Identifier -->
        <div class="bg-white dark:bg-dark-card rounded-lg shadow-sm border border-light-border dark:border-dark-border p-6">
          <h2 class="text-lg font-semibold text-light-fg dark:text-dark-fg mb-4">Identifier</h2>
          <code class="block p-4 bg-light-bg dark:bg-dark-bg rounded text-sm text-light-muted dark:text-dark-muted break-all">
            {{ organization['@id'] }}
          </code>
        </div>
      </div>
    </div>
  </div>
</template>
