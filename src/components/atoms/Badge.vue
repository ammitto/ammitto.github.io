<script setup lang="ts">
import { computed } from 'vue'
import { sources, entityTypes, statuses } from '@/config'
import { pillToneVars, NEUTRAL_SEED } from '@/config/palette'

const props = defineProps<{
  variant?: 'source' | 'person' | 'organization' | 'vessel' | 'aircraft' | 'active' | 'suspended' | 'delisted' | 'terminated' | 'expired' | 'default'
  sourceCode?: string
}>()

/**
 * The seed colour this badge is themed from. Every lookup can miss — the
 * source-code prop is optional and is genuinely omitted by callers (regime
 * badges in EntityPage), the variant is cast from API strings that may not be
 * a known type or status — so a miss falls back to the neutral seed rather
 * than to `undefined`, which used to reach the style binding as the string
 * "undefined20".
 */
const seed = computed(() => {
  if (props.variant === 'source') {
    return sources.find(s => s.code === props.sourceCode)?.color ?? NEUTRAL_SEED
  }
  const type = entityTypes.find(t => t.code === props.variant)
  if (type) return type.color
  const status = statuses.find(s => s.code === props.variant)
  if (status) return status.color
  return NEUTRAL_SEED
})

/**
 * Both themes' colours at once, as custom properties. `.tone-pill` and
 * `html.dark .tone-pill` in main.css pick a set; see src/config/palette.ts for
 * why the choice is made in CSS rather than by reading the theme here.
 */
const toneVars = computed(() => pillToneVars(seed.value))
</script>

<template>
  <span
    class="tone-pill inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border"
    :style="toneVars"
  >
    <slot />
  </span>
</template>
