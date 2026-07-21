<script setup lang="ts">
import { useHead } from '@unhead/vue'
import TheHeader from '@/components/organisms/TheHeader.vue'
import TheFooter from '@/components/organisms/TheFooter.vue'
import { siteConfig } from '@/config'

useHead({
  title: siteConfig.name,
  meta: [
    { name: 'description', content: siteConfig.description },
    { property: 'og:title', content: siteConfig.name },
    { property: 'og:description', content: siteConfig.description },
    { property: 'og:url', content: siteConfig.url },
  ],
})
</script>

<template>
  <div class="min-h-screen flex flex-col bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text">
    <TheHeader />
    <main class="flex-1">
      <RouterView />
    </main>
    <TheFooter />
  </div>
</template>
