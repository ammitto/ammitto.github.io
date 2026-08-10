<script setup lang="ts">
import Logo from '@/components/atoms/Logo.vue'
import { siteConfig, sources } from '@/config'

const currentYear = new Date().getFullYear()
</script>

<template>
  <footer class="bg-light-surface dark:bg-dark-surface border-t border-light-border dark:border-dark-border">
    <div class="container-wide py-12">
      <div class="grid md:grid-cols-4 gap-8">
        <div class="md:col-span-2">
          <Logo class="mb-4" />
          <p class="text-light-muted dark:text-dark-muted mb-4 max-w-md">
            {{ siteConfig.description }}
          </p>
          <p class="text-sm text-light-muted dark:text-dark-muted">
            © {{ currentYear }} {{ siteConfig.name }}. All rights reserved.
          </p>
        </div>

        <div>
          <h4 class="font-semibold mb-4 text-light-text dark:text-dark-text">Data Sources</h4>
          <ul class="space-y-2">
            <li v-for="source in sources.slice(0, 5)" :key="source.code">
              <a
                :href="source.url"
                target="_blank"
                rel="noopener noreferrer"
                class="text-sm text-light-muted dark:text-dark-muted hover:text-brand-link transition-colors"
              >
                {{ source.name }}
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h4 class="font-semibold mb-4 text-light-text dark:text-dark-text">Links</h4>
          <ul class="space-y-2">
            <li>
              <RouterLink
                to="/about"
                class="text-sm text-light-muted dark:text-dark-muted hover:text-brand-link transition-colors"
              >
                About
              </RouterLink>
            </li>
            <li>
              <RouterLink
                to="/license"
                class="text-sm text-light-muted dark:text-dark-muted hover:text-brand-link transition-colors"
              >
                License
              </RouterLink>
            </li>
            <li>
              <RouterLink
                to="/api"
                class="text-sm text-light-muted dark:text-dark-muted hover:text-brand-link transition-colors"
              >
                API Documentation
              </RouterLink>
            </li>
            <li>
              <RouterLink
                to="/ontology"
                class="text-sm text-light-muted dark:text-dark-muted hover:text-brand-link transition-colors"
              >
                Ontology
              </RouterLink>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </footer>
</template>
