<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  label: string
  count?: number
  active?: boolean
  color?: string
}>()

const emit = defineEmits<{
  click: []
}>()

const style = computed(() => {
  if (props.active && props.color) {
    return {
      backgroundColor: props.color + '20',
      color: props.color,
      borderColor: props.color + '40',
    }
  }
  return {}
})
</script>

<template>
  <button
    @click="emit('click')"
    class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border transition-all"
    :class="[
      active
        ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
        : 'border-light-border dark:border-dark-border hover:border-brand-primary/50 text-light-text dark:text-dark-text',
    ]"
    :style="style"
  >
    <span>{{ label }}</span>
    <span
      v-if="count !== undefined"
      class="px-1.5 py-0.5 rounded-full text-xs"
      :class="active ? 'bg-brand-primary/20' : 'bg-light-surface dark:bg-dark-surface'"
    >
      {{ count.toLocaleString() }}
    </span>
  </button>
</template>
