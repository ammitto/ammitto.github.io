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
  <article
    class="glass-card p-4 hover:border-brand-primary/50 cursor-pointer transition-all group"
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
      <div class="flex flex-col items-end gap-1">
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
