<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, onUpdated, ref, shallowRef, watch } from 'vue'
import EntityCard from '@/components/molecules/EntityCard.vue'
import type { searchRowToCard } from '@/utils/birthAdapters'
import { gridOffsets, gridRows, rowAt } from '@/utils/virtualGrid'

type Card = ReturnType<typeof searchRowToCard>
const props = defineProps<{ entities: Card[]; virtualize: boolean; resetKey: string }>()
const grid = ref<HTMLElement | null>(null)
const controls = ref<HTMLElement | null>(null)
const ready = ref(false)
const columns = ref(1)
const desktop = ref(false)
const viewportTop = ref(0)
const viewportHeight = ref(800)
const beforeResults = ref(false)
const lastFullyVisible = ref(false)
const focusedId = ref<string | null>(null)
const lastNavigatedIndex = ref(-1)
const showAll = ref(false)
const measurements = shallowRef(new Map<string, number>())
const virtual = computed(() => ready.value && props.virtualize && !showAll.value && props.entities.length > 50)
// Retain the original two-column cards; measure each row by its tallest card.
const offsets = computed(() => gridOffsets(props.entities.length, columns.value,
  props.entities.map(entity => measurements.value.get(entity.id))))
const focusedIndex = computed(() => props.entities.findIndex(entity => entity.id === focusedId.value))
const rows = computed(() => gridRows(offsets.value, viewportTop.value, viewportHeight.value, 2,
  focusedIndex.value < 0 ? -1 : Math.floor(focusedIndex.value / columns.value)))
const rendered = computed(() => !virtual.value
  ? props.entities.map((entity, index) => ({ entity, index }))
  : rows.value.flatMap(row => {
    const first = row * columns.value
    return props.entities.slice(first, first + columns.value).map((entity, i) => ({ entity, index: first + i }))
  }))
const visibleRow = computed(() => rowAt(offsets.value, viewportTop.value + 1))
const lastVisibleRow = computed(() => rowAt(offsets.value, viewportTop.value + viewportHeight.value - 1))
const firstVisible = computed(() => Math.min(props.entities.length, visibleRow.value * columns.value + 1))
const lastVisible = computed(() => Math.min(props.entities.length, (lastVisibleRow.value + 1) * columns.value))
const desktopRow = computed(() => lastNavigatedIndex.value < 0
  ? visibleRow.value : Math.floor(lastNavigatedIndex.value / columns.value))
const previousDisabled = computed(() => (desktop.value ? desktopRow.value : visibleRow.value) === 0)
const nextDisabled = computed(() => desktop.value && lastNavigatedIndex.value >= 0
  ? desktopRow.value >= offsets.value.length - 2
  : !props.entities.length || (!beforeResults.value && (
  visibleRow.value >= offsets.value.length - 2
  || (lastNavigatedIndex.value === props.entities.length - 1 && lastFullyVisible.value))))

function cardStyle(index: number) {
  if (!virtual.value) return undefined
  return {
    position: 'absolute' as const,
    top: `${offsets.value[Math.floor(index / columns.value)]}px`,
    left: columns.value === 1 || index % 2 === 0 ? '0' : 'calc(50% + 8px)',
    width: columns.value === 1 ? '100%' : 'calc(50% - 8px)',
    // EntityCard animates borders. Geometry must follow measurement directly.
    transitionProperty: 'color, background-color, border-color, box-shadow',
  }
}

let frame = 0
function readingViewport() {
  const header = document.querySelector('header')?.getBoundingClientRect().bottom ?? 65
  const anchor = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0
  const toolbar = controls.value?.getBoundingClientRect()
  const mobile = window.matchMedia('(max-width: 1023px)').matches
  const filters = document.querySelector('[data-testid="applied-filters-bar"]')?.getBoundingClientRect()
  const filtersBottom = mobile && filters && filters.top <= header + 2 ? filters.bottom : 0
  return { top: Math.max(header, anchor, filtersBottom), bottom: mobile && toolbar ? toolbar.top : window.innerHeight }
}
function updateViewport() {
  frame = 0
  if (!grid.value) return
  desktop.value = window.matchMedia('(min-width: 1024px)').matches
  const bounds = grid.value.getBoundingClientRect()
  const view = readingViewport()
  beforeResults.value = bounds.top >= view.bottom
  viewportTop.value = Math.max(0, view.top - bounds.top)
  viewportHeight.value = Math.max(1, view.bottom - Math.max(bounds.top, view.top))
  const last = grid.value.querySelector<HTMLElement>(`[data-result-index="${props.entities.length - 1}"]`)
  const rect = last?.getBoundingClientRect()
  lastFullyVisible.value = !!rect && rect.top >= view.top - 1 && rect.bottom <= view.bottom + 1
}
function scheduleViewport() { if (!frame) frame = requestAnimationFrame(updateViewport) }
let observer: ResizeObserver | undefined
let width = 0
function observeCards() {
  if (!observer || !grid.value) return
  observer.disconnect()
  observer.observe(grid.value)
  grid.value.querySelectorAll<HTMLElement>('[data-result-index]').forEach(card => observer?.observe(card))
}
function onFocus(event: FocusEvent) {
  const card = (event.target as HTMLElement).closest<HTMLElement>('[data-result-index]')
  const index = Number(card?.dataset.resultIndex)
  focusedId.value = card ? props.entities[index]?.id ?? null : null
  if (desktop.value && card && props.entities[index]) lastNavigatedIndex.value = index
}
let focusTransfers = 0
function onBlur(event: FocusEvent) {
  if (focusTransfers === 0 && !grid.value?.contains(event.relatedTarget as Node | null)) focusedId.value = null
}
async function focusResult(index: number, offsetTop?: number) {
  if (index < 0 || index >= props.entities.length) return
  // Retiring the old focused virtual row emits focusout before the new row
  // can receive focus. Keep the destination mounted during that transfer.
  focusTransfers++
  try {
    focusedId.value = props.entities[index].id
    lastNavigatedIndex.value = index
    await nextTick()
    const card = grid.value?.querySelector<HTMLElement>(`[data-result-index="${index}"]`)
    if (!card) return
    card.focus({ preventScroll: true })
    card.scrollIntoView({ block: 'start', behavior: 'instant' })
    // A few frames let ResizeObserver replace estimated row heights. Restore the
    // record's viewport anchor, rather than a stale pixel in an estimated list.
    if (offsetTop !== undefined) {
      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
        const target = Math.max(readingViewport().top, Math.min(offsetTop, window.innerHeight - 120))
        window.scrollBy(0, card.getBoundingClientRect().top - target)
      }
    }
    updateViewport()
  } finally { focusTransfers-- }
}
async function restoreResult(ref: string, offsetTop: number) {
  await nextTick()
  await focusResult(props.entities.findIndex(entity => entity.ref === ref), offsetTop)
}
defineExpose({ restoreResult })
function onKeydown(event: KeyboardEvent) {
  if (!virtual.value || event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return
  const card = (event.target as HTMLElement).closest<HTMLElement>('[data-result-index]')
  if (!card) return
  const target = Number(card.dataset.resultIndex) + (event.shiftKey ? -1 : 1)
  if (target < 0 || target >= props.entities.length) return
  event.preventDefault()
  void focusResult(target)
}
function movePage(direction: -1 | 1) {
  updateViewport()
  if (desktop.value && lastNavigatedIndex.value >= 0) {
    // Returning to this static toolbar changes the viewport, not the reader's
    // place. Continue from the last focused result using a full reading page.
    const row = desktopRow.value
    const pageHeight = Math.max(1, window.innerHeight - readingViewport().top)
    const destination = rowAt(offsets.value, offsets.value[row] + direction * pageHeight)
    const steppedRow = direction > 0 ? Math.max(row + 1, destination) : Math.min(row - 1, destination)
    const targetRow = Math.max(0, Math.min(offsets.value.length - 2, steppedRow))
    void focusResult(targetRow * columns.value)
    return
  }
  const first = visibleRow.value
  const last = lastVisibleRow.value
  const targetRow = direction > 0
    ? (beforeResults.value ? 0 : last > first ? last : first + 1)
    : first - Math.max(1, last - first)
  void focusResult(Math.max(0, Math.min(props.entities.length - 1, targetRow * columns.value)))
}
watch(() => props.resetKey, () => { focusedId.value = null; lastNavigatedIndex.value = -1; measurements.value = new Map(); scheduleViewport() })
watch(() => props.entities.length, scheduleViewport)
onUpdated(observeCards)
onMounted(() => {
  columns.value = window.matchMedia('(min-width: 640px)').matches ? 2 : 1
  observer = new ResizeObserver(entries => {
    const next = new Map(measurements.value)
    let changed = false
    for (const entry of entries) {
      if (entry.target === grid.value) {
        const nextColumns = window.matchMedia('(min-width: 640px)').matches ? 2 : 1
        if (Math.abs(entry.contentRect.width - width) > 1 || nextColumns !== columns.value) {
          width = entry.contentRect.width; columns.value = nextColumns; next.clear(); changed = true
        }
      } else {
        const target = entry.target as HTMLElement
        const entity = props.entities[Number(target.dataset.resultIndex)]
        const height = target.getBoundingClientRect().height
        if (entity && height > 0 && Math.abs((next.get(entity.id) ?? 0) - height) > .5) { next.set(entity.id, height); changed = true }
      }
    }
    if (changed) measurements.value = next
    scheduleViewport()
  })
  ready.value = true
  observeCards()
  updateViewport()
  window.addEventListener('scroll', scheduleViewport, { passive: true })
  window.addEventListener('resize', scheduleViewport, { passive: true })
})
onBeforeUnmount(() => {
  observer?.disconnect(); cancelAnimationFrame(frame)
  window.removeEventListener('scroll', scheduleViewport)
  window.removeEventListener('resize', scheduleViewport)
})
</script>

<template>
  <div class="result-list-region">
    <nav v-if="virtualize && entities.length" ref="controls" class="result-navigation border-light-border dark:border-dark-border bg-white dark:bg-dark-bg" aria-label="Move through loaded results">
      <button type="button" class="btn-secondary result-previous" :disabled="previousDisabled" @click="movePage(-1)">Previous<span class="sr-only"> results</span></button>
      <p class="result-range text-light-muted dark:text-dark-muted">
        <strong class="text-light-text dark:text-dark-text">{{ firstVisible }}–{{ lastVisible }} of {{ entities.length }} loaded</strong>
        <span class="hidden sm:inline">Use Tab to read each record</span>
      </p>
      <button type="button" class="btn-secondary result-next" :disabled="nextDisabled" @click="movePage(1)">Next<span class="sr-only"> results</span></button>
    </nav>
    <div v-if="virtualize && entities.length > 50" class="my-3 text-right">
      <button type="button" class="text-sm text-brand-link underline min-h-[44px]" @click="showAll = !showAll">{{ showAll ? 'Use scrolling result view' : 'Show all loaded results' }}</button>
    </div>
    <div ref="grid" data-testid="search-results" :data-virtual="virtual" class="min-w-0" :class="virtual ? 'relative' : 'grid sm:grid-cols-2 gap-4'" :style="virtual ? { height: `${Math.max(0, offsets[offsets.length - 1] - 16)}px` } : undefined" @focusin="onFocus" @focusout="onBlur" @keydown="onKeydown">
      <EntityCard v-for="{ entity, index } in rendered" :key="entity.id" :entity="entity" :data-result-index="index" :style="cardStyle(index)" :aria-description="`Result ${index + 1} of ${entities.length} loaded`" />
    </div>
  </div>
</template>

<style scoped>
.result-navigation { display:flex; align-items:center; flex-wrap:wrap; gap:.75rem; margin-bottom:1rem; }
.result-range { flex:1; font-size:.8rem; text-align:center; line-height:1.45; font-variant-numeric:tabular-nums; }
.result-range strong { display:block; font-weight:600; }
.result-navigation button { min-height:44px; }
/* Offset records below both sticky bars without making the toolbar itself
   fall outside the document's padded scroll viewport. */
.result-list-region :deep([data-result-index]) { scroll-margin-top:80px; }
@media(max-width:1023px) {
  .result-list-region :deep([data-result-index]) { scroll-margin-top:63px; scroll-margin-bottom:80px; }
  .result-navigation { z-index:25; margin-bottom:0; border-top:2px solid #0066cc; position:fixed; top:auto; bottom:0; left:0; right:0; padding:.65rem .8rem calc(.65rem + env(safe-area-inset-bottom)); border-width:1px 0 0; }
  .result-list-region { padding-bottom:calc(80px + env(safe-area-inset-bottom)); }
}
@media(max-width:767px) {
  .result-range { font-size:.7rem; }
  .result-navigation button { padding:.5rem .7rem; }
}
</style>
<style>
@media(max-width:1023px) { html:has(.result-navigation), html:has(.result-navigation):has(.applied-filters-bar) { scroll-padding-top:65px; } }
@media(max-width:1023px) { body:has(.result-navigation) { padding-bottom:calc(80px + env(safe-area-inset-bottom)); } }
</style>
