<script setup lang="ts">
import { computed, defineAsyncComponent, watch, type AsyncComponentLoader } from 'vue'
import DetailLoading from './DetailLoading.vue'
import DetailLoadError from './DetailLoadError.vue'
import { DETAIL_ROUTE_TITLES, type DetailRouteName } from '../utils/detailRoutes.js'
import { useRoute } from '../utils/navigation'
const route = useRoute()
watch(() => route.path, () => {
  if (typeof document === 'undefined') return
  const title = DETAIL_ROUTE_TITLES[route.name as DetailRouteName] || 'Page not found'
  const canonical = new URL(route.path, 'https://www.ammitto.org').href
  document.title = `${title} · Ammitto`
  document.querySelector('link[rel="canonical"]')?.setAttribute('href', canonical)
  document.querySelector('meta[property="og:url"]')?.setAttribute('content', canonical)
  document.querySelector('meta[property="og:title"]')?.setAttribute('content', title)
}, { immediate: true })

function loadDetail(loader: AsyncComponentLoader) {
  return defineAsyncComponent({
    loader, loadingComponent: DetailLoading, errorComponent: DetailLoadError,
    delay: 0, timeout: 15_000,
  })
}

const pages = {
  entity: loadDetail(() => import('../views/EntityPage.vue')),
  announcement: loadDetail(() => import('../views/AnnouncementPage.vue')),
  group: loadDetail(() => import('../views/GroupPage.vue')),
  'legal-instrument': loadDetail(() => import('../views/LegalInstrumentPage.vue')),
  'document-type': loadDetail(() => import('../views/DocumentTypePage.vue')),
  organization: loadDetail(() => import('../views/OrganizationPage.vue')),
} satisfies Record<DetailRouteName, ReturnType<typeof loadDetail>>
const notFound = loadDetail(() => import('../views/NotFoundPage.vue'))
const page = computed(() => pages[route.name as keyof typeof pages] || notFound)
</script>

<template>
  <div data-detail-fallback><component :is="page" :key="route.path" /></div>
</template>
