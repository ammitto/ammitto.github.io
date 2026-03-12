<script setup lang="ts">
import { computed } from 'vue'
import { sources } from '@/config'

interface SourceCount {
  code: string
  count: number
}

const props = defineProps<{
  modelValue: string | null
  counts: SourceCount[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

// Build filter options with counts
const filterOptions = computed(() => {
  const options: Array<{ code: string | null; label: string; count: number; color: string }> = [
    { code: null, label: 'All', count: props.counts.reduce((sum, s) => sum + s.count, 0), color: '#6b7280' }
  ]

  // Sort counts by count descending, then add to options
  const sortedCounts = [...props.counts].sort((a, b) => b.count - a.count)

  for (const { code, count } of sortedCounts) {
    const sourceConfig = sources.find(s => s.code === code)
    options.push({
      code,
      label: sourceConfig?.name || code.toUpperCase(),
      count,
      color: sourceConfig?.color || '#6b7280'
    })
  }

  return options
})

const selectFilter = (code: string | null) => {
  emit('update:modelValue', code)
}
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <button
      v-for="option in filterOptions"
      :key="option.code ?? 'all'"
      @click="selectFilter(option.code)"
      :class="[
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all',
        modelValue === option.code
          ? 'text-white shadow-sm'
          : 'bg-light-bg dark:bg-dark-bg text-light-muted dark:text-dark-muted hover:bg-light-border dark:hover:bg-dark-border'
      ]"
      :style="modelValue === option.code ? { backgroundColor: option.color } : {}"
    >
      <span
        v-if="option.code !== null"
        class="w-2 h-2 rounded-full"
        :style="{ backgroundColor: option.color }"
      />
      <span>{{ option.label }}</span>
      <span
        :class="[
          'px-1.5 py-0.5 rounded text-xs',
          modelValue === option.code
            ? 'bg-white/20'
            : 'bg-light-border dark:bg-dark-border'
        ]"
      >
        {{ option.count }}
      </span>
    </button>
  </div>
</template>
