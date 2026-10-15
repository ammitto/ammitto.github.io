<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, onUpdated, ref, shallowRef, watch } from 'vue'
import EntityCard from '@/components/molecules/EntityCard.vue'
import type { searchRowToCard } from '@/utils/birthAdapters'
import { gridOffsets, gridRows, rowAt } from '@/utils/virtualGrid'

type Card = ReturnType<typeof searchRowToCard>
const props = defineProps<{ entities: Card[]; virtualize: boolean; resetKey: string }>()
const grid = ref<HTMLElement | null>(null)
const ready = ref(false)
const columns = ref(1)
const viewportTop = ref(0)
const viewportHeight = ref(800)
const focusedId = ref<string | null>(null)
const showAll = ref(false)
const measurements = shallowRef(new Map<string, number>())
// Keep the first page and progressive mounting unchanged. Beyond that, DOM
// size depends on the viewport rather than the number of Load More clicks.
const virtual = computed(() => ready.value && props.virtualize && !showAll.value && props.entities.length > 50)
const offsets = computed(() => gridOffsets(
  props.entities.length, columns.value,
  props.entities.map((entity) => measurements.value.get(entity.id)),
))
const focusedIndex = computed(() => props.entities.findIndex((entity) => entity.id === focusedId.value))
const rows = computed(() => gridRows(
  offsets.value, viewportTop.value, viewportHeight.value, 2,
  focusedIndex.value < 0 ? -1 : Math.floor(focusedIndex.value / columns.value),
))
const rendered = computed(() => {
  if (!virtual.value) return props.entities.map((entity, index) => ({ entity, index }))
  return rows.value.flatMap((row) => {
    const first = row * columns.value
    return props.entities.slice(first, first + columns.value).map((entity, i) => ({ entity, index: first + i }))
  })
})
const visibleRow = computed(() => rowAt(offsets.value, viewportTop.value))
const lastVisibleRow = computed(() => rowAt(offsets.value, viewportTop.value + viewportHeight.value))
const firstVisible = computed(() => visibleRow.value * columns.value)
const lastVisible = computed(() => Math.min(props.entities.length, (lastVisibleRow.value + 1) * columns.value))

function cardStyle(index: number) {
  if (!virtual.value) return undefined
  return {
    position: 'absolute' as const,
    top: `${offsets.value[Math.floor(index / columns.value)]}px`,
    left: columns.value === 1 || index % 2 === 0 ? '0' : 'calc(50% + 8px)',
    width: columns.value === 1 ? '100%' : 'calc(50% - 8px)',
    // Keep keyboard destinations below the site's sticky navigation.
    scrollMarginTop: '6rem',
    scrollMarginBottom: '1rem',
    // EntityCard animates borders. Geometry must follow measurement directly.
    transitionProperty: 'color, background-color, border-color, box-shadow',
  }
}

let frame = 0
function updateViewport() {
  frame = 0
  if (!grid.value) return
  viewportTop.value = Math.max(0, -grid.value.getBoundingClientRect().top)
  viewportHeight.value = window.innerHeight
}
function scheduleViewport() {
  if (!frame) frame = requestAnimationFrame(updateViewport)
}

let observer: ResizeObserver | undefined
let width = 0
function observeCards() {
  if (!observer || !grid.value) return
  observer.disconnect()
  observer.observe(grid.value)
  grid.value.querySelectorAll<HTMLElement>('[data-result-index]').forEach((card) => observer?.observe(card))
}

function onFocus(event: FocusEvent) {
  const card = (event.target as HTMLElement).closest<HTMLElement>('[data-result-index]')
  const index = Number(card?.dataset.resultIndex)
  focusedId.value = card ? props.entities[index]?.id ?? null : null
}
function onBlur(event: FocusEvent) {
  if (!grid.value?.contains(event.relatedTarget as Node | null)) focusedId.value = null
}

async function focusResult(index: number) {
  if (index < 0 || index >= props.entities.length) return
  // Retaining the destination before updating the DOM also handles a Tab from
  // a retained off-screen row to a row outside the current viewport.
  focusedId.value = props.entities[index].id
  await nextTick()
  const card = grid.value?.querySelector<HTMLElement>(`[data-result-index="${index}"]`)
  card?.focus({ preventScroll: true })
  card?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
  updateViewport()
}
function onKeydown(event: KeyboardEvent) {
  if (!virtual.value || event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return
  const card = (event.target as HTMLElement).closest<HTMLElement>('[data-result-index]')
  if (!card) return
  const target = Number(card.dataset.resultIndex) + (event.shiftKey ? -1 : 1)
  // The first and last links keep normal document navigation to controls.
  if (target < 0 || target >= props.entities.length) return
  event.preventDefault()
  void focusResult(target)
}
function movePage(direction: -1 | 1) {
  const pageRows = Math.max(1, lastVisibleRow.value - visibleRow.value)
  const row = Math.max(0, Math.min(offsets.value.length - 2, visibleRow.value + direction * pageRows))
  void focusResult(row * columns.value)
}

watch(() => props.resetKey, () => {
  focusedId.value = null
  measurements.value = new Map()
  scheduleViewport()
})
watch(() => props.entities.length, scheduleViewport)
onUpdated(observeCards)
onMounted(() => {
  columns.value = window.matchMedia('(min-width: 640px)').matches ? 2 : 1
  observer = new ResizeObserver((entries) => {
    const next = new Map(measurements.value)
    let changed = false
    for (const entry of entries) {
      if (entry.target === grid.value) {
        const newWidth = entry.contentRect.width
        const nextColumns = window.matchMedia('(min-width: 640px)').matches ? 2 : 1
        if (Math.abs(newWidth - width) > 1 || nextColumns !== columns.value) {
          width = newWidth
          columns.value = nextColumns
          next.clear()
          changed = true
        }
      } else {
        const target = entry.target as HTMLElement
        const entity = props.entities[Number(target.dataset.resultIndex)]
        const height = target.getBoundingClientRect().height
        if (entity && height > 0 && Math.abs((next.get(entity.id) ?? 0) - height) > 0.5) {
          next.set(entity.id, height)
          changed = true
        }
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
  observer?.disconnect()
  cancelAnimationFrame(frame)
  window.removeEventListener('scroll', scheduleViewport)
  window.removeEventListener('resize', scheduleViewport)
})
</script>

<template>
  <div v-if="virtualize && entities.length > 50" class="mb-4 flex flex-wrap items-center gap-3 text-sm text-light-muted dark:text-dark-muted">
    <p v-if="virtual">Browse results with Tab, Shift+Tab, or the previous and next buttons.</p>
    <button type="button" class="btn-secondary" @click="showAll = !showAll">
      {{ showAll ? 'Use scrolling result view' : 'Show all loaded results' }}
    </button>
    <template v-if="virtual">
      <button type="button" class="btn-secondary" :disabled="firstVisible === 0" @click="movePage(-1)">Previous results</button>
      <button type="button" class="btn-secondary" :disabled="lastVisible >= entities.length" @click="movePage(1)">Next results</button>
    </template>
  </div>
  <div
    ref="grid"
    data-testid="search-results"
    :data-virtual="virtual"
    class="min-w-0"
    :class="virtual ? 'relative' : 'grid sm:grid-cols-2 gap-4'"
    :style="virtual ? { height: `${Math.max(0, offsets[offsets.length - 1] - 16)}px` } : undefined"
    @focusin="onFocus"
    @focusout="onBlur"
    @keydown="onKeydown"
  >
    <EntityCard
      v-for="{ entity, index } in rendered"
      :key="entity.id"
      :entity="entity"
      :data-result-index="index"
      :style="cardStyle(index)"
      :aria-description="virtual ? `Result ${index + 1} of ${entities.length} loaded` : undefined"
    />
  </div>
</template>
