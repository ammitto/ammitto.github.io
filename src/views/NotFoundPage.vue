<script setup lang="ts">
import { useHead } from '@unhead/vue'
import { useRoute } from 'vue-router'

/**
 * Reached two ways, and they look identical to the visitor.
 *
 * A path that matches no route at all, and a direct hit on any URL that
 * GitHub Pages does not have a file for — those all arrive as 404.html,
 * which is this application's own shell, so the router resolves the
 * original path here. Without this record `<RouterView>` renders nothing
 * and the visitor gets a header, a footer and a blank column, which reads
 * as a broken site rather than a wrong address.
 *
 * Entity, announcement, group, legal-instrument, document-type and
 * organization pages do NOT land here for a bad id: they match their own
 * route and report their own "not found" from the failed node fetch. This
 * is for paths outside the router entirely.
 */
const route = useRoute()

useHead({
  title: 'Page not found - Ammitto',
  meta: [{ name: 'robots', content: 'noindex' }],
})
</script>

<template>
  <div class="min-h-screen">
    <div class="container-wide py-12">
      <div class="max-w-3xl mx-auto">
        <h1 class="text-4xl font-bold mb-6 text-light-text dark:text-dark-text">
          Page not found
        </h1>

        <div class="glass-card p-6 mb-8 border-l-4 border-amber-500">
          <p class="text-light-text dark:text-dark-text mb-0">
            Nothing is published at
            <code class="font-mono break-all">{{ route.fullPath }}</code>.
          </p>
        </div>

        <p class="text-light-muted dark:text-dark-muted mb-6">
          If you followed a link here, it may be out of date. These are good
          places to pick up from:
        </p>

        <ul class="space-y-2">
          <li>
            <RouterLink to="/search" class="text-brand-link hover:underline">
              Search the sanctions data
            </RouterLink>
          </li>
          <li>
            <RouterLink to="/browse" class="text-brand-link hover:underline">
              Browse by entities, sanctions, groups and more
            </RouterLink>
          </li>
          <li>
            <RouterLink to="/sources" class="text-brand-link hover:underline">
              See every source we publish
            </RouterLink>
          </li>
          <li>
            <RouterLink to="/api" class="text-brand-link hover:underline">
              Use the API directly
            </RouterLink>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
