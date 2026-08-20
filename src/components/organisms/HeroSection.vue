<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import SearchInput from '@/components/atoms/SearchInput.vue'
import Badge from '@/components/atoms/Badge.vue'
import { siteConfig, sources } from '@/config'

const router = useRouter()
const searchQuery = ref('')

// Stats loaded from API
const entityCount = ref(0)
const sourceCount = ref(15)
const typeCount = ref(0)

const handleSearch = () => {
  if (searchQuery.value.trim()) {
    router.push({ name: 'search', query: { q: searchQuery.value.trim() } })
  } else {
    router.push({ name: 'search' })
  }
}

onMounted(async () => {
  try {
    // Both figures come from stats.json, which this page needs anyway
    // for the source count. The entity count used to be read from
    // search-index.json instead: every row in the corpus, megabytes of
    // it, fetched on each visit to the front page so that one number
    // could be taken off the top.
    const statsResponse = await fetch('/api/v1/stats.json')
    if (statsResponse.ok) {
      const stats = await statsResponse.json()
      entityCount.value = stats.total_entities || 0
      sourceCount.value = Object.keys(stats.sources || {}).length
    }

    // Load type facets for type count
    const typesResponse = await fetch('/api/v1/facets/types.json')
    if (typesResponse.ok) {
      const types = await typesResponse.json()
      typeCount.value = types.facets?.length || 0
    }
  } catch (e) {
    console.error('Failed to load stats:', e)
  }
})
</script>

<template>
  <!--
    `hero-section` names the component in the DOM, the way `.ontology-browser`
    and `.hierarchy-node` do elsewhere. ALLOWED_INCOMPLETE in
    tests/e2e/contrast-dom.spec.js scopes its two entries to it: the gradient
    below makes axe decline to judge the text over it, and without a container
    to point at, that allowance would extend to the whole page.
  -->
  <section class="hero-section relative py-20 overflow-hidden">
    <div class="absolute inset-0 bg-gradient-to-br from-brand-primary/5 via-transparent to-brand-primary/10" />

    <div class="container-wide relative">
      <div class="max-w-3xl mx-auto text-center">
        <h1 class="text-4xl md:text-5xl lg:text-6xl font-bold mb-4 text-light-text dark:text-dark-text">
          {{ siteConfig.tagline }}
        </h1>
        <p class="text-lg md:text-xl text-light-muted dark:text-dark-muted mb-8">
          {{ siteConfig.description }}
        </p>

        <div class="flex flex-wrap justify-center gap-4 mb-8">
          <Badge v-for="source in sources.slice(0, 4)" :key="source.code" variant="source" :source-code="source.code">
            {{ source.name }}
          </Badge>
        </div>

        <form @submit.prevent="handleSearch" class="max-w-xl mx-auto mb-12">
          <SearchInput
            v-model="searchQuery"
            placeholder="Search by name, country, or identifier..."
            size="lg"
          />
        </form>

        <div class="flex flex-wrap justify-center gap-8">
          <div class="text-center">
            <div class="text-3xl font-bold text-brand-link">{{ entityCount.toLocaleString() }}</div>
            <div class="text-sm text-light-muted dark:text-dark-muted">Entities</div>
          </div>
          <div class="text-center">
            <div class="text-3xl font-bold text-brand-link">{{ sourceCount }}</div>
            <div class="text-sm text-light-muted dark:text-dark-muted">Sources</div>
          </div>
          <div class="text-center">
            <div class="text-3xl font-bold text-brand-link">{{ typeCount }}</div>
            <div class="text-sm text-light-muted dark:text-dark-muted">Types</div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
