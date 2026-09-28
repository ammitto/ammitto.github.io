<script setup lang="ts">
import { ref, computed } from 'vue'

const props = withDefaults(defineProps<{
  modelValue?: string
  placeholder?: string
  // The field's accessible name. A placeholder is not a label: it disappears
  // once text is typed and some screen readers do not announce it.
  label?: string
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}>(), {
  label: 'Search sanctions data',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const inputRef = ref<HTMLInputElement>()
const internalValue = computed({
  get: () => props.modelValue ?? '',
  set: (val) => emit('update:modelValue', val),
})

const sizeClasses = computed(() => {
  const sizes = {
    sm: 'text-sm py-2 pl-10',
    md: 'text-base py-3 pl-12',
    lg: 'text-lg py-4 pl-14',
  }
  return sizes[props.size || 'md']
})

// Whitespace alone is no query (the search trims it away), so it earns no
// clear button either.
const hasText = computed(() => internalValue.value.trim() !== '')

// Room on the right for whatever sits over the text there, so typed text
// never runs under the clear button or the spinner.
const rightPadding = computed(() => {
  if (hasText.value) return props.loading ? 'pr-20' : 'pr-14'
  return props.size === 'lg' ? 'pr-6' : 'pr-4'
})

const iconSize = computed(() => {
  const sizes = {
    sm: 'w-4 h-4 left-3',
    md: 'w-5 h-5 left-4',
    lg: 'w-6 h-6 left-5',
  }
  return sizes[props.size || 'md']
})

const focus = () => inputRef.value?.focus()

// Focus goes back to the field: the button is removed as the text goes, and
// someone who cleared a query is about to type the next one.
function clear() {
  emit('update:modelValue', '')
  focus()
}

// `<script setup>` exposes nothing by default, so this was unreachable from a
// parent. SearchPage needs it: activating a "Did you mean" suggestion unmounts
// the card the button lives in, and without moving focus first the browser
// drops it to <body> and a keyboard user restarts at the top of the document.
defineExpose({ focus })
</script>

<template>
  <div class="relative">
    <svg
      class="absolute top-1/2 -translate-y-1/2 text-light-muted dark:text-dark-muted"
      :class="iconSize"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
    <input
      ref="inputRef"
      v-model="internalValue"
      type="text"
      :placeholder="placeholder"
      :aria-label="label"
      :class="[
        'w-full rounded-xl border bg-white dark:bg-dark-surface border-light-border dark:border-dark-border',
        'focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none',
        'transition-all text-light-text dark:text-dark-text',
        'placeholder:text-light-muted dark:placeholder:text-dark-muted',
        sizeClasses,
        rightPadding,
      ]"
      @focus="focus"
    />
    <!--
      A native button, so Enter and Space work, and `type="button"` so that
      inside the home page's search form it clears instead of submitting.
      44px square for a thumb; the icon inside stays small.
    -->
    <button
      v-if="hasText"
      type="button"
      class="absolute top-1/2 -translate-y-1/2 right-1 w-11 h-11 inline-flex items-center justify-center rounded-lg text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
      aria-label="Clear search"
      data-testid="search-clear"
      @click="clear"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
    <span
      v-if="loading"
      class="absolute top-1/2 -translate-y-1/2 w-5 h-5"
      :class="hasText ? 'right-12' : 'right-4'"
    >
      <!--
        The rotation and the vertical centering must not land on the same
        element. `animate-spin`'s keyframe sets `transform: rotate(...)`
        directly, which for the whole animated duration REPLACES any
        composed `transform` on that element rather than combining with
        it -- so a `-translate-y-1/2` on the same node loses its `-50%`
        centering for as long as the animation runs, and the icon visibly
        bobs up and down instead of spinning in place. Confirmed via an
        isolated CSS repro sampling the element's position across the
        animation cycle. Splitting them onto an outer (static position)
        and inner (rotation only) element keeps both transforms intact.
      -->
      <svg
        class="w-5 h-5 text-brand-link animate-spin"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          class="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          stroke-width="4"
        />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    </span>
  </div>
</template>
