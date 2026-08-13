<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import EntityCard from '@/components/molecules/EntityCard.vue'
import { useSanctionsData } from '@/composables/useSanctionsData'
import { entityTypes } from '@/config'

const { entities, loading, loadAllEntities, entityTypeCounts } = useSanctionsData()

const selectedType = ref<string | null>(null)
const page = ref(1)
const pageSize = 20

onMounted(() => {
  loadAllEntities()
})

const filteredEntities = computed(() => {
  let result = entities.value
  if (selectedType.value) {
    result = result.filter(e => e.entityType === selectedType.value)
  }
  return result
})

const paginatedEntities = computed(() => {
  return filteredEntities.value.slice(0, page.value * pageSize)
})

const hasMore = computed(() => {
  return paginatedEntities.value.length < filteredEntities.value.length
})

const loadMore = () => {
  page.value++
}

const setFilter = (type: string | null) => {
  selectedType.value = type
  page.value = 1
}

const entityAdapter = (entity: any) => {
  // Extract ref from full URI (e.g., "https://www.ammitto.org/entity/cn/CN-ACT1" -> "cn/CN-ACT1")
  const ref = entity.id.replace('https://www.ammitto.org/entity/', '')

  return {
    id: entity.id,
    ref,
    names: entity.names.map((n: any) => n.fullName),
    entityType: entity.entityType,
    source: entity.source,
    status: 'active' as const,
    country: entity.country,
  }
}
</script>

<template>
  <div class="min-h-screen">
    <div class="container-wide py-12">
      <div class="flex items-center gap-2 mb-6">
        <RouterLink to="/browse" class="text-light-muted dark:text-dark-muted hover:text-brand-link">
          Browse
        </RouterLink>
        <span class="text-light-muted dark:text-dark-muted">/</span>
        <span class="text-light-text dark:text-dark-text">Entities</span>
      </div>

      <h1 class="text-4xl font-bold mb-4 text-light-text dark:text-dark-text">
        Browse Entities
      </h1>
      <p class="text-light-muted dark:text-dark-muted mb-8 max-w-3xl">
        Browse all sanctioned individuals, organizations, vessels, and aircraft.
      </p>

      <div class="flex flex-wrap gap-3 mb-8">
        <button
          @click="setFilter(null)"
          class="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          :class="selectedType === null
            ? 'bg-brand-primary text-white'
            : 'bg-light-surface dark:bg-dark-surface text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text'"
        >
          All ({{ entities.length.toLocaleString() }})
        </button>
        <button
          v-for="type in entityTypes"
          :key="type.code"
          @click="setFilter(type.code)"
          class="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          :class="selectedType === type.code
            ? 'bg-brand-primary text-white'
            : 'bg-light-surface dark:bg-dark-surface text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text'"
        >
          {{ type.icon }} {{ type.name }} ({{ (entityTypeCounts[type.code] || 0).toLocaleString() }})
        </button>
      </div>

      <div v-if="loading && entities.length === 0" class="text-center py-12">
        <div class="w-8 h-8 border-2 border-brand-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p class="mt-4 text-light-muted dark:text-dark-muted">Loading entities...</p>
      </div>

      <template v-else>
        <div class="mb-4 text-sm text-light-muted dark:text-dark-muted">
          Showing {{ paginatedEntities.length.toLocaleString() }} of {{ filteredEntities.length.toLocaleString() }} entities
        </div>

        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <EntityCard
            v-for="entity in paginatedEntities"
            :key="entity.id"
            :entity="entityAdapter(entity)"
          />
        </div>

        <div v-if="hasMore" class="mt-8 text-center">
          <button @click="loadMore" class="btn-secondary">
            Load More ({{ (filteredEntities.length - paginatedEntities.length).toLocaleString() }} remaining)
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
