<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import Badge from '@/components/atoms/Badge.vue'
import { useEntityData } from '@/composables/useEntityData'
import { sources, entityTypes } from '@/config'

const route = useRoute()
const { entity, entityLoading, entityError, loadEntity, primaryName, aliases } = useEntityData()

const entityId = computed(() => route.params.id as string)

const sourceInfo = computed(() => {
  if (!entity.value) return null
  return sources.find(s => s.code === entity.value?.source)
})

const typeInfo = computed(() => {
  if (!entity.value) return null
  return entityTypes.find(t => t.code === entity.value?.entityType)
})

onMounted(() => {
  loadEntity(entityId.value)
})
</script>

<template>
  <div class="min-h-screen">
    <div class="container-wide py-8">
      <RouterLink
        to="/search"
        class="inline-flex items-center gap-2 text-light-muted dark:text-dark-muted hover:text-brand-primary mb-6"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Search
      </RouterLink>

      <div v-if="entityLoading" class="glass-card p-8 text-center">
        <div class="w-8 h-8 border-2 border-brand-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p class="mt-4 text-light-muted dark:text-dark-muted">Loading entity...</p>
      </div>

      <div v-else-if="entityError" class="glass-card p-8 text-center">
        <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-status-delisted/20 flex items-center justify-center">
          <svg class="w-8 h-8 text-status-delisted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 class="font-semibold text-lg mb-2">Entity Not Found</h3>
        <p class="text-light-muted dark:text-dark-muted">{{ entityError }}</p>
      </div>

      <article v-else-if="entity" class="glass-card p-8">
        <header class="mb-8">
          <div class="flex flex-wrap items-center gap-3 mb-4">
            <Badge :variant="entity.entityType as any">
              {{ typeInfo?.icon }} {{ typeInfo?.name }}
            </Badge>
            <Badge variant="source">
              {{ sourceInfo?.name }}
            </Badge>
            <Badge variant="active">
              Active
            </Badge>
          </div>

          <h1 class="text-3xl font-bold text-light-text dark:text-dark-text">
            {{ primaryName }}
          </h1>

          <p v-if="entity.id" class="text-light-muted dark:text-dark-muted mt-2 font-mono text-sm">
            ID: {{ entity.id }}
          </p>
        </header>

        <section v-if="aliases.length > 0" class="mb-8">
          <h2 class="text-lg font-semibold mb-3 text-light-text dark:text-dark-text">
            Also Known As
          </h2>
          <ul class="list-disc list-inside space-y-1 text-light-muted dark:text-dark-muted">
            <li v-for="alias in aliases" :key="alias">{{ alias }}</li>
          </ul>
        </section>

        <section v-if="entity.country || entity.birthDate" class="mb-8">
          <h2 class="text-lg font-semibold mb-3 text-light-text dark:text-dark-text">
            Details
          </h2>
          <dl class="grid sm:grid-cols-2 gap-4">
            <div v-if="entity.country">
              <dt class="text-sm text-light-muted dark:text-dark-muted">Country</dt>
              <dd class="font-medium text-light-text dark:text-dark-text">{{ entity.country }}</dd>
            </div>
            <div v-if="entity.birthDate">
              <dt class="text-sm text-light-muted dark:text-dark-muted">Birth Date</dt>
              <dd class="font-medium text-light-text dark:text-dark-text">{{ entity.birthDate }}</dd>
            </div>
            <div v-if="entity.sourceReference">
              <dt class="text-sm text-light-muted dark:text-dark-muted">Reference Number</dt>
              <dd class="font-medium text-light-text dark:text-dark-text font-mono">{{ entity.sourceReference }}</dd>
            </div>
          </dl>
        </section>

        <section v-if="entity.addresses && entity.addresses.length > 0" class="mb-8">
          <h2 class="text-lg font-semibold mb-3 text-light-text dark:text-dark-text">
            Addresses
          </h2>
          <div v-for="(addr, idx) in entity.addresses" :key="idx" class="glass-card p-4 mb-2">
            <p class="text-light-muted dark:text-dark-muted">
              {{ addr.street }}<br />
              {{ addr.city }}<br />
              {{ addr.state }}<br />
              {{ addr.country }} {{ addr.postalCode }}
            </p>
          </div>
        </section>

        <section v-if="entity.remarks" class="mb-8">
          <h2 class="text-lg font-semibold mb-3 text-light-text dark:text-dark-text">
            Remarks
          </h2>
          <p class="text-light-muted dark:text-dark-muted whitespace-pre-wrap">
            {{ entity.remarks }}
          </p>
        </section>

        <section v-if="entity.contact" class="mb-8">
          <h2 class="text-lg font-semibold mb-3 text-light-text dark:text-dark-text">
            Contact Information
          </h2>
          <p class="text-light-muted dark:text-dark-muted whitespace-pre-wrap">
            {{ entity.contact }}
          </p>
        </section>
      </article>
    </div>
  </div>
</template>
