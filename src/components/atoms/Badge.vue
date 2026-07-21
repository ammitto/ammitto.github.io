<script setup lang="ts">
import { computed } from 'vue'
import { sources, entityTypes, statuses } from '@/config'

const props = defineProps<{
  variant?: 'source' | 'person' | 'organization' | 'vessel' | 'aircraft' | 'active' | 'suspended' | 'delisted' | 'terminated' | 'expired' | 'default'
  sourceCode?: string
}>()

const style = computed(() => {
  if (props.variant === 'source') {
    const source = sources.find(s => s.code === props.sourceCode)
    return {
      backgroundColor: (source?.color || '#6b7280') + '20',
      color: source?.color || '#6b7280',
      borderColor: (source?.color || '#6b7280') + '40',
    }
  }

  if (props.variant && ['person', 'organization', 'vessel', 'aircraft'].includes(props.variant)) {
    const type = entityTypes.find(t => t.code === props.variant)
    return {
      backgroundColor: type?.color + '20',
      color: type?.color,
      borderColor: type?.color + '40',
    }
  }

  if (props.variant && ['active', 'suspended', 'delisted', 'terminated', 'expired'].includes(props.variant)) {
    const status = statuses.find(s => s.code === props.variant)
    return {
      backgroundColor: status?.color + '20',
      color: status?.color,
      borderColor: status?.color + '40',
    }
  }

  return {
    backgroundColor: '#6b728020',
    color: '#6b7280',
    borderColor: '#6b728040',
  }
})
</script>

<template>
  <span
    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border"
    :style="{
      backgroundColor: style.backgroundColor,
      color: style.color,
      borderColor: style.borderColor,
    }"
  >
    <slot />
  </span>
</template>
