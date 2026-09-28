<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'

/**
 * A modal panel that slides in from the right edge, over a dimmed backdrop.
 *
 * No dialog or focus-trap helper exists elsewhere in the site, so this carries
 * the whole modal contract itself: focus moves in on open and is held there,
 * Escape and a backdrop click close it, focus returns to whatever opened it,
 * the page behind stops scrolling and is made `inert` so neither a pointer nor
 * a screen reader's virtual cursor can reach it.
 */
const props = defineProps<{
  open: boolean
  title: string
}>()

const emit = defineEmits<{ close: [] }>()

const titleId = `drawer-title-${Math.random().toString(36).slice(2, 9)}`
const panel = ref<HTMLElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)

// Teleport is client-only: vite-ssg prerenders /search, and a teleported
// subtree in that HTML would not hydrate against the page's own markup.
const mounted = ref(false)
onMounted(() => { mounted.value = true })

let opener: HTMLElement | null = null
let savedOverflow = ''

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusables(): HTMLElement[] {
  if (!panel.value) return []
  return Array.from(panel.value.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter((el) => el.offsetParent !== null || el === document.activeElement)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
    return
  }
  if (e.key !== 'Tab') return
  const items = focusables()
  if (items.length === 0) {
    e.preventDefault()
    return
  }
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement
  // Wrap at both ends; also catch focus that has somehow left the panel.
  if (e.shiftKey && (active === first || !panel.value?.contains(active))) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && (active === last || !panel.value?.contains(active))) {
    e.preventDefault()
    first.focus()
  }
}

function setBackground(locked: boolean) {
  const app = document.getElementById('app')
  const root = document.documentElement
  if (locked) {
    savedOverflow = root.style.overflow
    root.style.overflow = 'hidden'
    app?.setAttribute('inert', '')
  } else {
    root.style.overflow = savedOverflow
    app?.removeAttribute('inert')
  }
}

async function activate() {
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  setBackground(true)
  document.addEventListener('keydown', onKeydown)
  await nextTick()
  closeButton.value?.focus()
}

function deactivate() {
  document.removeEventListener('keydown', onKeydown)
  // The panel stays mounted through its closing transition. Made inert first,
  // it stops being a modal dialog in the same tick as the page behind it stops
  // being inert, so neither focus nor a screen reader can be left inside it.
  panel.value?.setAttribute('inert', '')
  setBackground(false)
  // `inert` must be gone before this, or the focus call is silently refused.
  opener?.focus()
  opener = null
}

watch(() => props.open, (open, was) => {
  if (open && !was) activate()
  else if (!open && was) deactivate()
})

onBeforeUnmount(() => {
  if (props.open) deactivate()
})
</script>

<template>
  <Teleport v-if="mounted" to="body">
    <!--
      Motion only under `motion-safe`: with reduced motion requested the
      transition classes resolve to nothing and Vue swaps the panel in at once.
    -->
    <Transition
      enter-active-class="motion-safe:transition-opacity motion-safe:duration-200"
      enter-from-class="opacity-0"
      leave-active-class="motion-safe:transition-opacity motion-safe:duration-200"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-[60] bg-black/50"
        aria-hidden="true"
        data-testid="drawer-backdrop"
        @click="emit('close')"
      />
    </Transition>
    <Transition
      enter-active-class="motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out"
      enter-from-class="translate-x-full"
      leave-active-class="motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-in"
      leave-to-class="translate-x-full"
    >
      <div
        v-if="open"
        ref="panel"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        class="fixed inset-y-0 right-0 z-[61] flex flex-col w-[88vw] max-w-[400px] bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text shadow-2xl"
      >
        <div class="flex items-center gap-3 px-4 py-3 border-b border-light-border dark:border-dark-border">
          <h2 :id="titleId" class="text-lg font-semibold mr-auto">{{ title }}</h2>
          <slot name="actions" />
          <button
            ref="closeButton"
            type="button"
            class="inline-flex items-center justify-center min-w-[44px] min-h-[44px] -mr-2 rounded-lg hover:bg-light-surface dark:hover:bg-dark-surface"
            :aria-label="`Close ${title.toLowerCase()}`"
            @click="emit('close')"
          >
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="flex-1 overflow-y-auto overscroll-contain">
          <slot />
        </div>
        <div class="px-4 py-3 border-t border-light-border dark:border-dark-border">
          <slot name="footer" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
