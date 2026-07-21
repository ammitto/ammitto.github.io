<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  name: string
  fullName: string
  description: string
  entityCount?: number
  entryCount?: number
  color: string
  url: string
  authority: string
  country: string
}>()

const formattedCount = computed(() => {
  if (!props.entityCount) return 'N/A'
  return props.entityCount.toLocaleString()
})
</script>

<template>
  <article class="glass-card p-6 hover:border-opacity-100 transition-all group">
    <div class="flex items-start justify-between mb-4">
      <div class="flex items-center gap-3">
        <div
          class="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
          :style="{ backgroundColor: color }"
        >
          {{ country }}
        </div>
        <div>
          <h3 class="font-semibold text-lg text-light-text dark:text-dark-text">
            {{ name }}
          </h3>
          <p class="text-sm text-light-muted dark:text-dark-muted">
            {{ authority }}
          </p>
        </div>
      </div>
    </div>

    <p class="text-light-muted dark:text-dark-muted mb-4">
      {{ description }}
    </p>

    <div class="flex items-center justify-between">
      <div class="flex gap-4 text-sm">
        <div>
          <span class="text-light-muted dark:text-dark-muted">Entities:</span>
          <span class="font-semibold ml-1 text-light-text dark:text-dark-text">
            {{ formattedCount }}
          </span>
        </div>
      </div>
      <a
        :href="url"
        target="_blank"
        rel="noopener noreferrer"
        class="text-brand-primary hover:underline text-sm font-medium"
      >
        View Source →
      </a>
    </div>
  </article>
</template>
