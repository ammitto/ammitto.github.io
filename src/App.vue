<script setup lang="ts">
import { useHead } from '@unhead/vue'
import { useRoute } from 'vue-router'
import TheHeader from '@/components/organisms/TheHeader.vue'
import TheFooter from '@/components/organisms/TheFooter.vue'
import { siteConfig } from '@/config'

const route = useRoute()
const pageNames: Record<string, string> = {
  search: 'Search sanctions records', api: 'API documentation', download: 'Download data',
  entity: 'Entity record', announcement: 'Official announcement', group: 'Sanctioned entities',
  'legal-instrument': 'Legal instrument', 'document-type': 'Document type', organization: 'Issuing body',
  about: 'About', ruby: 'Ruby integration', schema: 'Data schema', sources: 'Data sources',
  browse: 'Browse data', 'browse-entities': 'Browse entities', 'browse-sanctions': 'Sanctions overview',
  'browse-actions': 'Action history availability', 'browse-legal-instruments': 'Legal instruments',
  'browse-groups': 'Entity groups', 'browse-announcements': 'Announcements',
  'browse-document-types': 'Document types', 'browse-organizations': 'Issuing bodies',
  ontology: 'Ontology reference', license: 'License', 'not-found': 'Page not found',
}
useHead(() => ({
  title: route.name === 'home' ? siteConfig.name : `${pageNames[String(route.name)] || siteConfig.name} · Ammitto`,
  meta: [
    { name: 'description', content: siteConfig.description },
    { property: 'og:title', content: pageNames[String(route.name)] || siteConfig.name },
    { property: 'og:description', content: siteConfig.description },
    { property: 'og:url', content: `${siteConfig.url.replace(/\/$/, '')}${route.path}` },
  ],
}))
</script>

<template>
  <div class="min-h-screen flex flex-col bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text">
    <TheHeader />
    <main id="main-content" tabindex="-1" class="flex-1 focus:outline-none">
      <RouterView />
    </main>
    <TheFooter />
  </div>
</template>
