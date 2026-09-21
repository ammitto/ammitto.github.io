<script setup lang="ts">
import { computed } from 'vue'
import { pillToneVars } from '@/config/palette'

const props = defineProps<{
  label: string
  count?: number
  active?: boolean
  color?: string
  /**
   * The facet exists but currently matches nothing, so selecting it could only
   * ever produce an empty result. Rendered muted, inert, and with the reason
   * in its accessible name rather than hidden: `sourceCatalog.ts` deliberately
   * keeps a source listed while its data repo is pending (`ru`), on the
   * grounds that a silently forgotten source is the worse bug. A filter that
   * cannot match must still not be offered as though it could.
   */
  unavailable?: boolean
  /** Short reason shown in place of the count, e.g. "not yet published". */
  unavailableLabel?: string
}>()

const emit = defineEmits<{
  click: []
}>()

/**
 * An active pill carrying a seed colour is themed like a Badge: both themes'
 * derived colours travel as custom properties and `.tone-pill` picks. Without
 * a seed colour the pill falls back to the brand link/primary classes below.
 */
const toned = computed(() => props.active && !props.unavailable && !!props.color)
const toneVars = computed(() => (toned.value ? pillToneVars(props.color) : {}))
</script>

<template>
  <button
    type="button"
    :disabled="unavailable"
    :aria-pressed="unavailable ? undefined : !!active"
    :aria-label="unavailable ? `${label} — ${unavailableLabel || 'not yet published'}` : undefined"
    @click="unavailable || emit('click')"
    class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border transition-all"
    :class="[
      unavailable
        ? 'border-light-border dark:border-dark-border text-light-muted dark:text-dark-muted opacity-60 cursor-not-allowed'
        : toned
          ? 'tone-pill'
          : active
            ? 'border-brand-primary bg-brand-primary/10 text-brand-link'
            : 'border-light-border dark:border-dark-border hover:border-brand-primary/50 text-light-text dark:text-dark-text',
    ]"
    :style="toneVars"
  >
    <span>{{ label }}</span>
    <span v-if="unavailable" class="text-xs italic">
      {{ unavailableLabel || 'not yet published' }}
    </span>
    <span
      v-else-if="count !== undefined"
      class="px-1.5 py-0.5 rounded-full text-xs"
      :class="active && !toned ? 'bg-brand-primary/20' : !active ? 'bg-light-surface dark:bg-dark-surface' : ''"
    >
      {{ count.toLocaleString() }}
    </span>
  </button>
</template>
