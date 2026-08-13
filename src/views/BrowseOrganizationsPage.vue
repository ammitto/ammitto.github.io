<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { RouterLink } from 'vue-router'

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

interface IndexNode {
  '@id': string
}

const organizations = ref<Organization[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const getDisplayName = (org: Organization): string => {
  const enName = org.name.find(n => n.lang === 'en')
  const zhName = org.name.find(n => n.lang === 'zh')
  return enName?.value || zhName?.value || 'Untitled'
}

const getChineseName = (org: Organization): string | null => {
  const zhName = org.name.find(n => n.lang === 'zh')
  return zhName?.value || null
}

const getOrgRef = (id: string): string => {
  return id.replace('https://www.ammitto.org/organization/', '')
}

const getTypeLabel = (type?: string): string => {
  if (!type) return ''
  const labels: Record<string, string> = {
    ministry: 'Ministry',
    department: 'Department',
    agency: 'Agency',
    committee: 'Committee',
    office: 'Office',
    working_mechanism: 'Working Mechanism',
  }
  return labels[type] || type
}

// Group organizations by type
const groupedOrganizations = computed(() => {
  const groups: Record<string, Organization[]> = {}
  for (const org of organizations.value) {
    const type = org.type || 'other'
    if (!groups[type]) groups[type] = []
    groups[type].push(org)
  }
  return groups
})

const typeOrder = ['ministry', 'committee', 'working_mechanism', 'department', 'agency', 'office', 'other']

onMounted(async () => {
  try {
    const indexResponse = await fetch('/api/v1/node/organization/index.jsonld')
    if (!indexResponse.ok) {
      error.value = 'Failed to load organizations index'
      return
    }

    const indexData = await indexResponse.json()
    const nodes: IndexNode[] = indexData.nodes || []

    const loadedOrgs: Organization[] = []
    for (const node of nodes) {
      const ref = getOrgRef(node['@id'])
      const response = await fetch(`/api/v1/node/organization/${ref}.jsonld`)
      if (response.ok) {
        const data = await response.json()
        loadedOrgs.push(data)
      }
    }

    organizations.value = loadedOrgs
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
        class="inline-flex items-center gap-2 text-light-muted dark:text-dark-muted hover:text-brand-link mb-6"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Browse
      </RouterLink>

      <div class="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 class="text-3xl font-bold text-light-fg dark:text-dark-fg mb-2">
            Organizations
          </h1>
          <p class="text-light-muted dark:text-dark-muted">
            Government bodies, ministries, and agencies involved in sanctions.
          </p>
        </div>
        <div class="text-right shrink-0">
          <div class="text-2xl font-bold text-light-fg dark:text-dark-fg">{{ organizations.length }}</div>
          <div class="text-sm text-light-muted dark:text-dark-muted">organizations</div>
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
      <div v-else-if="organizations.length === 0" class="text-center py-12">
        <p class="text-light-muted dark:text-dark-muted">No organizations found.</p>
      </div>

      <!-- Organizations list by type -->
      <div v-else class="space-y-8">
        <section
          v-for="type in typeOrder.filter(t => groupedOrganizations[t])"
          :key="type"
        >
          <h2 class="text-xl font-semibold text-light-fg dark:text-dark-fg mb-4 flex items-center gap-2">
            <span class="capitalize">{{ getTypeLabel(type) || 'Other' }}</span>
            <span class="text-sm font-normal text-light-muted dark:text-dark-muted">
              ({{ groupedOrganizations[type].length }})
            </span>
          </h2>
          <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <RouterLink
              v-for="org in groupedOrganizations[type]"
              :key="org['@id']"
              :to="`/organization/${org.identifier}`"
              class="block min-w-0 bg-white dark:bg-dark-card rounded-lg shadow-sm border border-light-border dark:border-dark-border p-6 hover:border-brand-primary/50 transition-all"
            >
              <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-lg flex items-center justify-center text-xl bg-lime-100 dark:bg-lime-900/30 shrink-0">
                  🏛️
                </div>
                <div class="flex-1 min-w-0">
                  <h3 class="font-semibold text-light-fg dark:text-dark-fg group-hover:text-brand-link transition-colors">
                    {{ getDisplayName(org) }}
                  </h3>
                  <p v-if="getChineseName(org)" class="text-sm text-light-muted dark:text-dark-muted">
                    {{ getChineseName(org) }}
                  </p>
                  <p class="text-xs text-light-muted dark:text-dark-muted mt-1 font-mono truncate">
                    {{ org.identifier }}
                  </p>
                  <a
                    v-if="org.url"
                    :href="org.url"
                    target="_blank"
                    rel="noopener"
                    class="text-xs text-brand-link hover:underline mt-1 inline-block"
                    @click.stop
                  >
                    Visit website →
                  </a>
                </div>
                <svg class="w-5 h-5 text-light-muted dark:text-dark-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </RouterLink>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
