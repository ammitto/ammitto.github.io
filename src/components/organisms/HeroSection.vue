<script setup lang="ts">
import { useRouter } from 'vue-router'
import SearchInput from '@/components/atoms/SearchInput.vue'
import Badge from '@/components/atoms/Badge.vue'
import { siteConfig, sources, stats } from '@/config'

const router = useRouter()
const searchQuery = defineModel<string>('searchQuery', { default: '' })

const handleSearch = () => {
  if (searchQuery.value.trim()) {
    router.push({ name: 'search', query: { q: searchQuery.value.trim() } })
  } else {
    router.push({ name: 'search' })
  }
}
</script>

<template>
  <section class="relative py-20 overflow-hidden">
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
            <div class="text-3xl font-bold text-brand-primary">{{ stats.entities.toLocaleString() }}</div>
            <div class="text-sm text-light-muted dark:text-dark-muted">Entities</div>
          </div>
          <div class="text-center">
            <div class="text-3xl font-bold text-brand-primary">{{ stats.sources }}</div>
            <div class="text-sm text-light-muted dark:text-dark-muted">Sources</div>
          </div>
          <div class="text-center">
            <div class="text-3xl font-bold text-brand-primary">{{ stats.countries }}</div>
            <div class="text-sm text-light-muted dark:text-dark-muted">Countries</div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
