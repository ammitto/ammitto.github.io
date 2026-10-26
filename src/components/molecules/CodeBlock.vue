<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  code: string
  language?: string
  title?: string
}>()

const hydrated = ref(false)
onMounted(() => { hydrated.value = true })

const copyState = ref<'idle' | 'copying' | 'copied' | 'failed'>('idle')
const codeElement = ref<HTMLElement | null>(null)
const snippetName = computed(() => props.title || `${props.language || 'Code'}: ${props.code.trim().split('\n')[0]?.slice(0, 80) || 'snippet'}`)
let resetTimer: ReturnType<typeof setTimeout> | undefined
let copyRequest = 0

function resetCopyState() {
  ++copyRequest
  clearTimeout(resetTimer)
  copyState.value = 'idle'
}

watch(() => props.code, resetCopyState)
onBeforeUnmount(() => {
  ++copyRequest
  clearTimeout(resetTimer)
})

const copyCode = async () => {
  const request = ++copyRequest
  clearTimeout(resetTimer)
  copyState.value = 'copying'
  try {
    await navigator.clipboard.writeText(props.code)
    if (request !== copyRequest) return
    copyState.value = 'copied'
    resetTimer = setTimeout(resetCopyState, 3000)
  } catch {
    if (request !== copyRequest) return
    copyState.value = 'failed'
  }
}

function selectCode() {
  if (!codeElement.value) return
  codeElement.value.parentElement?.focus()
  const range = document.createRange()
  range.selectNodeContents(codeElement.value)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}
</script>

<template>
  <div class="min-w-0 rounded-lg overflow-hidden border border-light-border dark:border-dark-border">
    <div class="flex items-center justify-between gap-3 px-4 py-2 bg-light-surface dark:bg-dark-surface border-b border-light-border dark:border-dark-border">
      <span class="min-w-0 break-words text-sm text-light-muted dark:text-dark-muted font-mono">
        {{ title || language || 'Code' }}
      </span>
      <span v-if="copyState === 'copying' || copyState === 'copied'" aria-hidden="true" class="ml-auto shrink-0 text-xs text-light-muted dark:text-dark-muted">
        {{ copyState === 'copied' ? 'Copied' : 'Copying…' }}
      </span>
      <button
        type="button"
        @click="copyCode"
        :aria-label="`Copy ${snippetName}`"
        :disabled="!hydrated || copyState === 'copying'"
        class="min-h-10 shrink-0 px-2 text-sm text-brand-link underline underline-offset-4 transition-colors"
      >
        Copy
      </button>
    </div>
    <pre tabindex="0" role="region" :aria-label="`${snippetName} code`" class="p-4 overflow-x-auto bg-dark-bg text-dark-text text-sm"><code ref="codeElement">{{ code }}</code></pre>
    <div role="status" class="text-sm text-light-text dark:text-dark-text" :class="{ 'px-4 py-3 border-t border-light-border dark:border-dark-border': copyState === 'failed' }">
      <span v-if="copyState === 'copying'" class="sr-only">Copying {{ snippetName }}.</span>
      <span v-if="copyState === 'copied'" class="sr-only">{{ snippetName }} copied to clipboard.</span>
      <template v-if="copyState === 'failed'">
        Clipboard access is unavailable.
        <button type="button" @click="selectCode" class="text-brand-link underline underline-offset-4">Select code</button>, then copy it with your device's copy command.
      </template>
    </div>
  </div>
</template>
