<script setup lang="ts">
import FilterPill from '@/components/molecules/FilterPill.vue'
import { sources, entityTypes, listTypes, statuses } from '@/config'

interface Filters {
  sources: string[]
  entityTypes: string[]
  listTypes: string[]
  statuses: string[]
}

const props = defineProps<{
  filters: Filters
  counts: {
    sources: Record<string, number>
    entityTypes: Record<string, number>
    listTypes: Record<string, number>
    statuses: Record<string, number>
  }
}>()

const emit = defineEmits<{
  'update:filters': [filters: Filters]
  'clear': []
}>()

const toggleSource = (code: string) => {
  const newSources = props.filters.sources.includes(code)
    ? props.filters.sources.filter(s => s !== code)
    : [...props.filters.sources, code]
  emit('update:filters', { ...props.filters, sources: newSources })
}

const toggleEntityType = (code: string) => {
  const newTypes = props.filters.entityTypes.includes(code)
    ? props.filters.entityTypes.filter(t => t !== code)
    : [...props.filters.entityTypes, code]
  emit('update:filters', { ...props.filters, entityTypes: newTypes })
}

const toggleListType = (code: string) => {
  const newListTypes = props.filters.listTypes.includes(code)
    ? props.filters.listTypes.filter(l => l !== code)
    : [...props.filters.listTypes, code]
  emit('update:filters', { ...props.filters, listTypes: newListTypes })
}

const toggleStatus = (code: string) => {
  const newStatuses = props.filters.statuses.includes(code)
    ? props.filters.statuses.filter(s => s !== code)
    : [...props.filters.statuses, code]
  emit('update:filters', { ...props.filters, statuses: newStatuses })
}
</script>

<template>
  <div class="glass-card p-6">
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-semibold text-light-text dark:text-dark-text">Filters</h3>
      <button
        @click="emit('clear')"
        class="text-sm text-brand-link hover:underline"
      >
        Clear all
      </button>
    </div>

    <div class="space-y-6">
      <div>
        <h4 class="text-sm font-medium text-light-muted dark:text-dark-muted mb-3">
          Sources ({{ sources.length }})
        </h4>
        <div class="flex flex-wrap gap-2">
          <FilterPill
            v-for="source in sources"
            :key="source.code"
            :label="source.name"
            :count="counts.sources[source.code]"
            :active="filters.sources.includes(source.code)"
            :color="source.color"
            @click="toggleSource(source.code)"
          />
        </div>
      </div>

      <div>
        <h4 class="text-sm font-medium text-light-muted dark:text-dark-muted mb-3">
          Entity Types ({{ entityTypes.length }})
        </h4>
        <div class="flex flex-wrap gap-2">
          <FilterPill
            v-for="type in entityTypes"
            :key="type.code"
            :label="type.icon + ' ' + type.name"
            :count="counts.entityTypes[type.code]"
            :active="filters.entityTypes.includes(type.code)"
            :color="type.color"
            @click="toggleEntityType(type.code)"
          />
        </div>
      </div>

      <div>
        <h4 class="text-sm font-medium text-light-muted dark:text-dark-muted mb-3">
          List Types ({{ listTypes.length }})
        </h4>
        <div class="flex flex-wrap gap-2">
          <FilterPill
            v-for="listType in listTypes"
            :key="listType.code"
            :label="listType.name"
            :count="counts.listTypes[listType.code]"
            :active="filters.listTypes.includes(listType.code)"
            @click="toggleListType(listType.code)"
          />
        </div>
      </div>

      <div>
        <h4 class="text-sm font-medium text-light-muted dark:text-dark-muted mb-3">
          Status ({{ statuses.length }})
        </h4>
        <div class="flex flex-wrap gap-2">
          <FilterPill
            v-for="status in statuses"
            :key="status.code"
            :label="status.name"
            :count="counts.statuses[status.code]"
            :active="filters.statuses.includes(status.code)"
            :color="status.color"
            @click="toggleStatus(status.code)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
