<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
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

const primaryName = computed(() => props.entity.names[0] || 'Unknown')
const aliases = computed(() => props.entity.names.slice(1, 4))
const sourceInfo = computed(() => sources.find(s => s.code === props.entity.source))
const typeInfo = computed(() => entityTypes.find(t => t.code === props.entity.entityType))
</script>

<template>
  <!--
    A link, because the only thing this card does is go to /entity/<ref>.
    It was an <article> carrying a @click handler: nothing focusable, no
    role for assistive technology to announce, and no Enter activation, so
    the primary way a visitor opens a search result was reachable by mouse
    alone. Routing through RouterLink instead of router.push also restores
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

    min-w-0 is load-bearing, not decoration. As a grid item this card defaults
    to min-width:auto, so the track had to be at least as wide as the card's
    min-content — and the name/alias lines are `truncate`, i.e. white-space:
    nowrap, whose min-content is the FULL untruncated string. One long
    sanctioned name therefore stretched the whole single-column grid and the
    page with it: 1044px of scrollWidth in a 390px viewport on /search and
    /browse/entities. min-w-0 lets the track ignore that intrinsic width, and
    the truncation then does its job inside the card.
    tests/e2e/overflow.spec.js holds this at 320px and 390px on every route.
  -->
  <RouterLink
    :to="`/entity/${entity.ref}`"
    class="glass-card block min-w-0 p-4 hover:border-brand-primary/50 transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
  >
    <div class="flex items-start justify-between gap-3 mb-2">
      <div class="flex-1 min-w-0">
        <h3 class="font-semibold text-lg truncate text-light-text dark:text-dark-text">
          {{ primaryName }}
        </h3>
        <div v-if="aliases.length > 0" class="text-sm text-light-muted dark:text-dark-muted truncate">
          Also known as: {{ aliases.join(', ') }}
        </div>
      </div>
      <div class="flex flex-col items-end gap-1 min-w-0">
        <Badge :variant="entity.entityType as any">
          <!--
            Now that the whole card is one link, everything in it is read
            out as that link's name. The icon is decorative and duplicates
            the word beside it, so it is hidden rather than announced as
            "bust in silhouette" ahead of every result.
          -->
          <span aria-hidden="true">{{ typeInfo?.icon }}</span> {{ typeInfo?.name }}
        </Badge>
        <Badge variant="source" :source-code="entity.source">
          {{ sourceInfo?.name }}
        </Badge>
      </div>
    </div>

    <div class="flex flex-wrap gap-2 mt-3">
      <Badge v-if="entity.status" :variant="entity.status as any">
        {{ entity.status }}
      </Badge>
      <Badge v-if="entity.country">
        {{ entity.country }}
      </Badge>
      <Badge v-if="entity.birthDate">
        Born: {{ entity.birthDate }}
      </Badge>
    </div>
  </RouterLink>
</template>
