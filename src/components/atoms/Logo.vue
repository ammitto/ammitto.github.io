<script setup lang="ts">
import { siteConfig } from '@/config'
</script>

<template>
  <RouterLink
    to="/"
    class="flex items-center gap-2 font-bold text-xl text-light-text dark:text-dark-text hover:text-brand-primary dark:hover:text-brand-primary transition-colors"
  >
    <svg class="w-8 h-8" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="14" stroke="currentColor" stroke-width="2" class="text-brand-primary"/>
      <path
        d="M10 16c0-3.314 2.686-6 6-6s6 2.686 6 6-2.686 6-6 6"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        class="text-brand-primary"
      />
      <circle cx="16" cy="16" r="2" fill="currentColor" class="text-brand-primary"/>
    </svg>
    <span>{{ siteConfig.name }}</span>
  </RouterLink>
</template>
