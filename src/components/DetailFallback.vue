<script setup lang="ts">
import { computed, defineAsyncComponent, watch } from 'vue'
import { useRoute } from '../utils/navigation'
const route = useRoute()
const titles: Record<string, string> = {
  entity: 'Entity record', announcement: 'Official announcement', group: 'Sanctioned entities',
  'legal-instrument': 'Legal instrument', 'document-type': 'Document type', organization: 'Issuing body',
}
watch(() => route.path, () => {
  if (typeof document === 'undefined') return
  const title = titles[route.name] || 'Page not found'
  const canonical = new URL(route.path, 'https://www.ammitto.org').href
  document.title = `${title} · Ammitto`
  document.querySelector('link[rel="canonical"]')?.setAttribute('href', canonical)
  document.querySelector('meta[property="og:url"]')?.setAttribute('content', canonical)
  document.querySelector('meta[property="og:title"]')?.setAttribute('content', title)
}, { immediate: true })

const pages = {
  entity: defineAsyncComponent(() => import('../views/EntityPage.vue')),
  announcement: defineAsyncComponent(() => import('../views/AnnouncementPage.vue')),
  group: defineAsyncComponent(() => import('../views/GroupPage.vue')),
  'legal-instrument': defineAsyncComponent(() => import('../views/LegalInstrumentPage.vue')),
  'document-type': defineAsyncComponent(() => import('../views/DocumentTypePage.vue')),
  organization: defineAsyncComponent(() => import('../views/OrganizationPage.vue')),
}
const notFound = defineAsyncComponent(() => import('../views/NotFoundPage.vue'))
const page = computed(() => pages[route.name as keyof typeof pages] || notFound)
</script>

<template>
  <div data-detail-fallback><component :is="page" :key="route.path" /></div>
</template>
