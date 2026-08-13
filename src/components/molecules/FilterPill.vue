<script setup lang="ts">
import { computed } from 'vue'
import { pillToneVars } from '@/config/palette'

const props = defineProps<{
  label: string
  count?: number
  active?: boolean
  color?: string
}>()

const emit = defineEmits<{
  click: []
}>()

/**
 * An active pill carrying a seed colour is themed like a Badge: both themes'
 * derived colours travel as custom properties and `.tone-pill` picks. Without
 * a seed colour the pill falls back to the brand link/primary classes below.
 */
const toned = computed(() => props.active && !!props.color)
const toneVars = computed(() => (toned.value ? pillToneVars(props.color) : {}))
</script>

<template>
  <button
    @click="emit('click')"
    class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border transition-all"
    :class="[
      toned
        ? 'tone-pill'
        : active
          ? 'border-brand-primary bg-brand-primary/10 text-brand-link'
          : 'border-light-border dark:border-dark-border hover:border-brand-primary/50 text-light-text dark:text-dark-text',
    ]"
    :style="toneVars"
  >
    <span>{{ label }}</span>
    <span
      v-if="count !== undefined"
      class="px-1.5 py-0.5 rounded-full text-xs"
      :class="active && !toned ? 'bg-brand-primary/20' : !active ? 'bg-light-surface dark:bg-dark-surface' : ''"
    >
      {{ count.toLocaleString() }}
    </span>
  </button>
</template>
