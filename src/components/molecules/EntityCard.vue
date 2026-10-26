<script setup lang="ts">
import { computed } from 'vue'

import Badge from '@/components/atoms/Badge.vue'
import { sources, entityTypes } from '@/config'

interface Entity {
  id: string
  ref?: string // Short reference for clean URLs (e.g., "cn/CN-ACT1 Federal")
  names: string[]
  entityType: string
  source: string
  status: string
  listedDate?: string
  country?: string
  birthDate?: string
}

const props = defineProps<{
  entity: Entity
}>()

const primaryName = computed(() => props.entity.names[0] || 'Unnamed record')
const aliases = computed(() => props.entity.names.slice(1, 4))
const sourceInfo = computed(() => sources.find(s => s.code === props.entity.source))
const titleId = computed(() => `record-name-${encodeURIComponent(props.entity.id)}`)
const factsId = computed(() => `record-facts-${encodeURIComponent(props.entity.id)}`)
const typeInfo = computed(() => entityTypes.find(t => t.code === props.entity.entityType))
</script>

<template>
  <!--
    A link, because the only thing this card does is go to /entity/<ref>.
    It was an <article> carrying a @click handler: nothing focusable, no
    role for assistive technology to announce, and no Enter activation, so
    the primary way a visitor opens a search result was reachable by mouse
    alone. Using a native anchor also preserves
    what a handler cannot fake — middle-click and ctrl-click open a new
    tab, the context menu offers copy-link-address, and vite-ssg emits a
    real href for crawlers.

    The link wraps the whole card rather than the title alone, matching the
    organization cards in BrowseOrganizationsPage. That is only valid while
    no descendant is itself interactive: every child here is a Badge, which
    renders a <span>. Adding a control to this card means moving it out of
    the link, or shrinking the link to the heading.

    The path is interpolated rather than passed as a route param so that
    the slash in a ref like `uk/aqd0087` stays a separator instead of
    becoming %2F.

    min-w-0 lets this grid item shrink inside its track. Names and aliases
    wrap in full, including unbroken identifiers and multilingual text.
  -->
  <a
    :href="`/entity/${entity.ref}`"
    :data-entity-ref="entity.ref"
    :aria-labelledby="titleId"
    :aria-describedby="factsId"
    class="glass-card block min-w-0 p-4 hover:border-brand-primary/50 transition-all group focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-primary"
  >
    <!--
      Below `sm` the type and source badges go under the name instead of
      beside it. At 320px a right-hand badge column took about a third of
      the card, and the truncated alias line was left with a few letters
      ("Also known as: ERI…"). From `sm` up they stack on the right.
    -->
    <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3 mb-2">
      <div class="sm:flex-1 min-w-0">
        <h3 :id="titleId" class="font-semibold text-lg break-words [overflow-wrap:anywhere] text-light-text dark:text-dark-text">
          <bdi>{{ primaryName }}</bdi>
        </h3>
        <div v-if="aliases.length > 0" class="text-sm text-light-muted dark:text-dark-muted break-words [overflow-wrap:anywhere]">
          Also known as: <bdi>{{ aliases.join(', ') }}</bdi>
        </div>
      </div>
      <div class="flex flex-wrap gap-1 min-w-0 sm:flex-col sm:flex-nowrap sm:items-end">
        <Badge :variant="entity.entityType as any">
          <!--
            Now that the whole card is one link, everything in it is read
            out as that link's name. The icon is decorative and duplicates
            the word beside it, so it is hidden rather than announced as
            "bust in silhouette" ahead of every result.
          -->
          <span aria-hidden="true">{{ typeInfo?.icon }}</span> {{ typeInfo?.name || entity.entityType }}
        </Badge>
        <Badge variant="source" :source-code="entity.source">
          {{ sourceInfo?.name || entity.source }}
        </Badge>
      </div>
    </div>

    <div :id="factsId" class="flex flex-wrap gap-2 mt-3">
      <Badge v-if="entity.status && entity.status !== 'unknown'" :variant="entity.status as any">
        {{ entity.status }}
      </Badge>
      <span v-if="!entity.status || entity.status === 'unknown'" class="text-xs text-light-muted dark:text-dark-muted">Listing status unavailable</span>
      <Badge v-if="entity.country">
        {{ entity.country }}
      </Badge>
      <Badge v-if="entity.birthDate">
        Born: {{ entity.birthDate }}
      </Badge>
    </div>
  </a>
</template>
