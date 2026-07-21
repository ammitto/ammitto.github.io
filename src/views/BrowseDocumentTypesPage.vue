<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

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

interface IndexNode {
  '@id': string
}

const documentTypes = ref<DocumentType[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const getDisplayName = (docType: DocumentType): string => {
  const enName = docType.name.find(n => n.lang === 'en')
  const zhName = docType.name.find(n => n.lang === 'zh')
  return enName?.value || zhName?.value || 'Untitled'
}

const getChineseName = (docType: DocumentType): string | null => {
  const zhName = docType.name.find(n => n.lang === 'zh')
  return zhName?.value || null
}

const getDocTypeRef = (id: string): string => {
  return id.replace('https://www.ammitto.org/document-type/', '')
}

onMounted(async () => {
  try {
    const indexResponse = await fetch('/api/v1/node/document-type/index.jsonld')
    if (!indexResponse.ok) {
      error.value = 'Failed to load document types index'
      return
    }

    const indexData = await indexResponse.json()
    const nodes: IndexNode[] = indexData.nodes || []

    const loadedTypes: DocumentType[] = []
    for (const node of nodes) {
      const ref = getDocTypeRef(node['@id'])
      const response = await fetch(`/api/v1/node/document-type/${ref}.jsonld`)
      if (response.ok) {
        const data = await response.json()
        loadedTypes.push(data)
      }
    }

    documentTypes.value = loadedTypes
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
        to="/browse"
        class="inline-flex items-center gap-2 text-light-muted dark:text-dark-muted hover:text-brand-primary mb-6"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Browse
      </RouterLink>

      <div class="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 class="text-3xl font-bold text-light-fg dark:text-dark-fg mb-2">
            Document Types
          </h1>
          <p class="text-light-muted dark:text-dark-muted">
            Types of official documents used in sanctions announcements.
          </p>
        </div>
        <div class="text-right shrink-0">
          <div class="text-2xl font-bold text-light-fg dark:text-dark-fg">{{ documentTypes.length }}</div>
          <div class="text-sm text-light-muted dark:text-dark-muted">types</div>
        </div>
      </div>

      <!-- Loading state -->
      <div v-if="loading" class="flex items-center justify-center py-12">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
      </div>

      <!-- Error state -->
      <div v-else-if="error" class="text-center py-12">
        <p class="text-red-500">{{ error }}</p>
      </div>

      <!-- Empty state -->
      <div v-else-if="documentTypes.length === 0" class="text-center py-12">
        <p class="text-light-muted dark:text-dark-muted">No document types found.</p>
      </div>

      <!-- Document types list -->
      <div v-else class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <RouterLink
          v-for="docType in documentTypes"
          :key="docType['@id']"
          :to="`/document-type/${docType.identifier}`"
          class="block bg-white dark:bg-dark-card rounded-lg shadow-sm border border-light-border dark:border-dark-border p-6 hover:border-brand-primary/50 transition-all"
        >
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-lg flex items-center justify-center text-xl bg-orange-100 dark:bg-orange-900/30 shrink-0">
              📄
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="font-semibold text-light-fg dark:text-dark-fg truncate group-hover:text-brand-primary transition-colors">
                {{ getDisplayName(docType) }}
              </h3>
              <p v-if="getChineseName(docType)" class="text-sm text-light-muted dark:text-dark-muted truncate">
                {{ getChineseName(docType) }}
              </p>
              <p class="text-xs text-light-muted dark:text-dark-muted mt-1 font-mono">
                {{ docType.identifier }}
              </p>
            </div>
            <svg class="w-5 h-5 text-light-muted dark:text-dark-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </RouterLink>
      </div>
    </div>
  </div>
</template>
