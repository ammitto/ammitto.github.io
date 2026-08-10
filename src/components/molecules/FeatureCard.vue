<script setup lang="ts">
defineProps<{
  title: string
  description: string
  icon?: string
}>()
</script>

<template>
  <div class="glass-card p-6 group">
    <div v-if="icon" class="text-4xl mb-4">{{ icon }}</div>
    <h3 class="font-semibold text-lg mb-2 text-light-text dark:text-dark-text group-hover:text-brand-link transition-colors">
      {{ title }}
    </h3>
    <p class="text-light-muted dark:text-dark-muted">
      {{ description }}
    </p>
  </div>
</template>
