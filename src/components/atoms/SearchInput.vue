<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  modelValue?: string
  placeholder?: string
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}>()

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
    sm: 'text-sm py-2 pl-10 pr-4',
    md: 'text-base py-3 pl-12 pr-4',
    lg: 'text-lg py-4 pl-14 pr-6',
  }
  return sizes[props.size || 'md']
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
</script>

<template>
  <div class="relative">
    <svg
      class="absolute top-1/2 -translate-y-1/2 text-light-muted dark:text-dark-muted"
      :class="iconSize"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
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
      :class="[
        'w-full rounded-xl border bg-white dark:bg-dark-surface border-light-border dark:border-dark-border',
        'focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none',
        'transition-all text-light-text dark:text-dark-text',
        'placeholder:text-light-muted dark:placeholder:text-dark-muted',
        sizeClasses,
      ]"
      @focus="focus"
    />
    <svg
      v-if="loading"
      class="absolute top-1/2 -translate-y-1/2 right-4 w-5 h-5 text-brand-link animate-spin"
      fill="none"
      viewBox="0 0 24 24"
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
  </div>
</template>
