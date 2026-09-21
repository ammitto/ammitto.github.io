<script setup lang="ts">
import { computed } from 'vue'
import { tileToneVars } from '@/config/palette'

const props = defineProps<{
  code: string
  color?: string
}>()

const toneVars = computed(() => tileToneVars(props.color))
</script>

<template>
  <span
    aria-hidden="true"
    class="tone-tile inline-flex h-8 w-8 shrink-0 items-center justify-center font-mono text-xs font-semibold"
    :style="toneVars"
  >
    {{ code }}
  </span>
</template>
