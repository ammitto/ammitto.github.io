<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
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

const router = useRouter()

const primaryName = computed(() => props.entity.names[0] || 'Unknown')
const aliases = computed(() => props.entity.names.slice(1, 4))
const sourceInfo = computed(() => sources.find(s => s.code === props.entity.source))
const typeInfo = computed(() => entityTypes.find(t => t.code === props.entity.entityType))

const goToEntity = () => {
  // Use path-based routing to avoid URL encoding issues with slashes
  // Results in /entity/uk/aqd0087 instead of /entity/uk%2Faqd0087
  router.push(`/entity/${props.entity.ref}`)
}
</script>

<template>
  <!--
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
  <article
    class="glass-card min-w-0 p-4 hover:border-brand-primary/50 cursor-pointer transition-all group"
    @click="goToEntity"
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
          {{ typeInfo?.icon }} {{ typeInfo?.name }}
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
  </article>
</template>
