<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import Badge from '@/components/atoms/Badge.vue'
import EntityCard from '@/components/molecules/EntityCard.vue'
import { sources } from '@/config'
import { getLanguageName } from '@/utils/language'
import { normalizeNode } from '@/utils/normalizeNode'
import { primaryNameOf } from '@/utils/entityNames'

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
  primaryNameOf(entity?.names) ?? 'Unknown'

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
    entityType: entity?.entity_type || 'organization',
    source: source,
    status: entry.status || 'active',
  }
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

// Get language from first entry's announcement
const announcementLanguage = computed(() => {
  if (entries.value.length > 0 && entries.value[0].announcement?.language) {
    return entries.value[0].announcement.language
  }
  return null
})

onMounted(async () => {
  const id = groupId.value
  const [source, docId] = id.split('/')

  try {
    // Load the group
    const groupResponse = await fetch(`/api/v1/node/group/${source}/${docId}.jsonld`)
    if (groupResponse.ok) {
      const groupData = await groupResponse.json()
      group.value = groupData

      // Load all entries and their entities in the group
      if (groupData?.entry_ids) {
        for (const entryId of groupData.entry_ids) {
          const entryPath = entryId.replace('https://www.ammitto.org/', 'api/v1/node/')
          const entryResponse = await fetch(`/${entryPath}.jsonld`)
          if (entryResponse.ok) {
            // Entry and entity nodes arrive in the producer's JSON-LD vocabulary
            const entryData = normalizeNode<Entry>(await entryResponse.json())
            if (!entryData) continue
            entries.value.push(entryData)

            // Load the entity for this entry
            if (entryData.entity_id) {
              const entityPath = entryData.entity_id.replace('https://www.ammitto.org/', 'api/v1/node/')
              const entityResponse = await fetch(`/${entityPath}.jsonld`)
              if (entityResponse.ok) {
                const entityData = normalizeNode<Entity>(await entityResponse.json())
                if (entityData) entities.value.set(entryData.entity_id, entityData)
              }
            }
          }
        }
      }
    } else {
      error.value = 'Group not found'
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
        to="/browse/groups"
        class="inline-flex items-center gap-2 text-light-muted dark:text-dark-muted hover:text-brand-link mb-6"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Groups
      </RouterLink>

      <div v-if="loading" class="glass-card p-8 text-center">
        <div class="w-8 h-8 border-2 border-brand-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p class="mt-4 text-light-muted dark:text-dark-muted">Loading group...</p>
      </div>

      <div v-else-if="error" class="glass-card p-8 text-center">
        <h3 class="font-semibold text-lg mb-2">Error</h3>
        <p class="text-light-muted dark:text-dark-muted">{{ error }}</p>
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
                <RouterLink
                  :to="`/announcement/${getAnnouncementRef(group.announcement_id)}`"
                  class="text-brand-link hover:underline"
                >
                  View Details
                </RouterLink>
              </dd>
            </div>
          </dl>
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
      </article>
    </div>
  </div>
</template>
