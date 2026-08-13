<script setup lang="ts">
import { ref, onMounted } from 'vue'
import HeroSection from '@/components/organisms/HeroSection.vue'
import FeatureCard from '@/components/molecules/FeatureCard.vue'
import { sources } from '@/config'
import { tileToneVars } from '@/config/palette'
import { useScrollAnimation } from '@/composables/useScrollAnimation'

useScrollAnimation()

const searchQuery = ref('')
const entityCount = ref(0)

// Load stats from API
onMounted(async () => {
  try {
    const response = await fetch('/api/v1/stats.json')
    if (response.ok) {
      const stats = await response.json()
      entityCount.value = stats.total_entities || 0
    }
  } catch (e) {
    console.error('Failed to load stats:', e)
  }
})

const features = [
  {
    title: 'Unified Data',
    description: 'Access sanctions data from multiple international sources through a single, standardized API.',
    icon: '🔗',
  },
  {
    title: 'Real-time Updates',
    description: 'Data is synchronized daily from official government sources to ensure accuracy.',
    icon: '⚡',
  },
  {
    title: 'JSON-LD Format',
    description: 'Structured data in JSON-LD format for easy integration and semantic web compatibility.',
    icon: '📊',
  },
  {
    title: 'Open Source',
    description: 'Fully open source with transparent methodology and community contributions welcome.',
    icon: '🌐',
  },
  {
    title: 'Free API',
    description: 'Free API access for developers with no rate limits for reasonable usage.',
    icon: '🚀',
  },
  {
    title: 'Ruby Gem',
    description: 'Official Ruby gem for easy integration into Ruby and Rails applications.',
    icon: '💎',
  },
]
</script>

<template>
  <div>
    <HeroSection v-model:search-query="searchQuery" />

    <section class="py-16 bg-light-surface/50 dark:bg-dark-surface/50">
      <div class="container-wide">
        <h2 class="text-2xl font-bold text-center mb-12 text-light-text dark:text-dark-text">
          Why Ammitto?
        </h2>
        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <FeatureCard
            v-for="feature in features"
            :key="feature.title"
            :title="feature.title"
            :description="feature.description"
            :icon="feature.icon"
            class="animate-on-scroll"
          />
        </div>
      </div>
    </section>

    <section class="py-16">
      <div class="container-wide">
        <h2 class="text-2xl font-bold text-center mb-4 text-light-text dark:text-dark-text">
          Data Sources
        </h2>
        <p class="text-center text-light-muted dark:text-dark-muted mb-12 max-w-2xl mx-auto">
          We aggregate sanctions data from {{ sources.length }} official sources worldwide,
          currently covering {{ entityCount.toLocaleString() }} entities.
        </p>
        <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          <RouterLink
            v-for="source in sources.slice(0, 8)"
            :key="source.code"
            :to="{ name: 'search', query: { source: source.code } }"
            class="glass-card p-4 hover:border-brand-primary/50 transition-all text-center group"
          >
            <div
              class="tone-tile w-12 h-12 rounded-lg mx-auto mb-3 flex items-center justify-center font-bold"
              :style="tileToneVars(source.color)"
            >
              {{ source.country }}
            </div>
            <h3 class="font-semibold text-light-text dark:text-dark-text group-hover:text-brand-link transition-colors">
              {{ source.name }}
            </h3>
            <p class="text-sm text-light-muted dark:text-dark-muted mt-1">
              {{ source.authority }}
            </p>
          </RouterLink>
        </div>
        <div class="text-center mt-8">
          <RouterLink
            to="/sources"
            class="text-brand-link hover:underline font-medium"
          >
            View all sources →
          </RouterLink>
        </div>
      </div>
    </section>

    <section class="py-16 bg-light-surface/50 dark:bg-dark-surface/50">
      <div class="container-wide">
        <div class="max-w-3xl mx-auto text-center">
          <h2 class="text-2xl font-bold mb-4 text-light-text dark:text-dark-text">
            Get Started
          </h2>
          <p class="text-light-muted dark:text-dark-muted mb-8">
            Access our API or download the data directly. No API key required.
          </p>
          <div class="flex flex-wrap justify-center gap-4">
            <RouterLink to="/api" class="btn-primary">
              API Documentation
            </RouterLink>
            <RouterLink to="/search" class="btn-secondary">
              Search Database
            </RouterLink>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
