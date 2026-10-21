<script setup lang="ts">
import { computed } from 'vue'
import { tileToneVars } from '@/config/palette'
import { safeExternalUrl } from '@/utils/externalUrl'
import SourceFreshness from './SourceFreshness.vue'

const props = defineProps<{
  sourceCode: string
  name: string
  fullName: string
  description: string
  entityCount?: number
  entryCount?: number
  color: string
  url: string
  authority: string
  country: string
  /**
   * The catalogue names this source but the published data carries no entities
   * for it. Shown rather than hidden: `sourceCatalog.ts` keeps a pending source
   * listed deliberately, so the card has to say why its count is absent instead
   * of rendering "N/A" next to published sources' figures.
   */
  pending?: boolean
  /**
   * Whether stats.json has resolved at all.
   *
   * Without it every card reads "Entities: N/A" until the fetch lands — which
   * is everything a crawler or a JS-disabled reader ever sees of this page, and
   * it erases the distinction `pending` exists to draw: published sources
   * rendered identically to any source that publishes nothing.
   */
  countsKnown?: boolean
}>()

const formattedCount = computed(() => {
  if (props.pending) return 'not yet published'
  if (!props.countsKnown) return '—'
  if (props.entityCount === undefined) return 'N/A'
  return props.entityCount.toLocaleString()
})
</script>

<template>
  <article class="glass-card p-6 hover:border-opacity-100 transition-all group flex flex-col min-w-0">
    <div class="flex items-start justify-between mb-4">
      <div class="flex items-center gap-3">
        <div
          class="tone-tile w-10 h-10 rounded-lg flex items-center justify-center font-bold shrink-0"
          :style="tileToneVars(color)"
        >
          {{ country }}
        </div>
        <div>
          <h3 class="font-semibold text-lg text-light-text dark:text-dark-text">
            {{ name }}
          </h3>
          <p class="text-sm text-light-muted dark:text-dark-muted mt-1">
            {{ authority }}
          </p>
        </div>
      </div>
    </div>

    <p class="text-light-muted dark:text-dark-muted mb-4">
      {{ description }}
    </p>
    <SourceFreshness v-if="country === 'CN'" />

    <div class="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div class="flex gap-4 text-sm">
        <div>
          <span class="text-light-muted dark:text-dark-muted">Entities:</span>
          <span class="font-semibold ml-1 text-light-text dark:text-dark-text">
            {{ formattedCount }}
          </span>
        </div>
      </div>
      <RouterLink
        v-if="countsKnown && !pending"
        :to="{ name: 'search', query: { source: sourceCode } }"
        class="text-brand-link underline underline-offset-4 text-sm font-semibold"
      >Search records <span class="sr-only">from {{ name }}</span></RouterLink>
    </div>
    <a
        v-if="safeExternalUrl(url)"
        :href="safeExternalUrl(url) as string"
        target="_blank"
        rel="noopener noreferrer"
        class="text-brand-link underline underline-offset-4 text-sm mt-4 self-start"
      >
        Official source <span class="sr-only">for {{ name }} (opens in a new tab)</span><span aria-hidden="true">↗</span>
      </a>
  </article>
</template>
