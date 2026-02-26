<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  code: string
  language?: string
  title?: string
}>()

const copied = ref(false)

const copyCode = async () => {
  try {
    await navigator.clipboard.writeText(props.code)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}
</script>

<template>
  <div class="rounded-lg overflow-hidden border border-light-border dark:border-dark-border">
    <div class="flex items-center justify-between px-4 py-2 bg-light-surface dark:bg-dark-surface border-b border-light-border dark:border-dark-border">
      <span class="text-sm text-light-muted dark:text-dark-muted font-mono">
        {{ title || language || 'Code' }}
      </span>
      <button
        @click="copyCode"
        class="text-sm text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text transition-colors"
      >
        {{ copied ? 'Copied!' : 'Copy' }}
      </button>
    </div>
    <pre class="p-4 overflow-x-auto bg-dark-bg text-dark-text text-sm"><code>{{ code }}</code></pre>
  </div>
</template>
