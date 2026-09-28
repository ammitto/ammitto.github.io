<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import Badge from '@/components/atoms/Badge.vue'

/**
 * The filters in force, each removable, above the results.
 *
 * Below `lg` it is pinned under the site header, so a reader deep in the
 * results can see what is narrowing them and change it without scrolling
 * back up: one row, as many whole chips as fit, then a "+N" pill for the
 * rest that opens the filter drawer, and the page's "Filters" button (the
 * `trailing` slot) at the right end. A chip is either shown whole or counted
 * in "+N", never cut: a half-drawn pill reads as a rendering fault and hides
 * how much is applied. From `lg` up the sidebar is on screen, so the row is a
 * plain, unpinned, wrapping summary above the results, absent when nothing is
 * applied.
 *
 * It never shows a result count: the only numbers a reader could file are
 * result counts, and those belong to the index, not to this bar.
 */
export interface AppliedChip {
  id: string
  label: string
  variant: string
  sourceCode?: string
}

const props = defineProps<{ chips: AppliedChip[]; panelOpen?: boolean }>()

const emit = defineEmits<{
  remove: [id: string]
  clear: []
  // The "+N" pill: show the rest, in the filter panel.
  'open-panel': []
  // Nothing left in the bar to take focus; the page decides where it goes.
  emptied: []
}>()

const list = ref<HTMLElement | null>(null)
const measureRow = ref<HTMLElement | null>(null)

// Gap between chips: `gap-1`.
const GAP = 4

// Width of each chip by id, read off an invisible copy of the row. Kept by id
// so removing a chip needs no new measurement: the survivors' widths are known
// and the row settles in the same render.
const chipWidths = ref<Record<string, number>>({})
const pillWidth = ref(0)
// Width the chips may use: the list's own box. It is `flex-1 min-w-0` with
// hidden overflow, so its width comes from the bar, never from the chips in
// it, and re-measuring it cannot feed back into itself.
const available = ref(0)
// Below `lg` the row is one line and collapses into "+N"; from `lg` it wraps.
const collapsing = ref(false)

function measure() {
  const row = measureRow.value
  if (!row) return
  const next: Record<string, number> = {}
  row.querySelectorAll<HTMLElement>('[data-chip-id]').forEach((el) => {
    next[el.dataset.chipId as string] = el.offsetWidth
  })
  chipWidths.value = next
  pillWidth.value = row.querySelector<HTMLElement>('[data-more-pill]')?.offsetWidth ?? 0
}

// How many chips, from the front, are shown whole. The rest go into "+N".
const visibleCount = computed(() => {
  const n = props.chips.length
  if (!collapsing.value) return n
  const widths = props.chips.map((c) => chipWidths.value[c.id])
  // Not measured yet (a chip just added): show none of the unknown ones.
  const firstUnknown = widths.findIndex((w) => w === undefined)
  const known = firstUnknown === -1 ? n : firstUnknown
  const room = available.value
  let used = 0
  let all = true
  for (let i = 0; i < n; i++) {
    if (i >= known) { all = false; break }
    used += (i ? GAP : 0) + (widths[i] as number)
    if (used > room) { all = false; break }
  }
  if (all) return n
  // Not all fit: keep as many as fit alongside the pill.
  let k = 0
  let width = pillWidth.value
  while (k < known && width + GAP + (widths[k] as number) <= room) {
    width += GAP + (widths[k] as number)
    k++
  }
  return k
})

const visibleChips = computed(() => props.chips.slice(0, visibleCount.value))
const hiddenCount = computed(() => props.chips.length - visibleCount.value)
const moreLabel = computed(() => {
  const n = hiddenCount.value
  const what = n === 1 ? 'filter' : 'filters'
  return visibleCount.value
    ? `${n} more ${what}, open filter panel`
    : `${n} ${what} applied, open filter panel`
})

// After the new chips are in the measuring row, before the browser paints.
watch(() => props.chips.map((c) => c.id + '\u0000' + c.label).join('\u0001'), measure, { flush: 'post' })

let ro: ResizeObserver | null = null
let lgQuery: MediaQueryList | null = null
const onLg = () => { collapsing.value = !lgQuery?.matches }
onMounted(() => {
  lgQuery = window.matchMedia('(min-width: 1024px)')
  onLg()
  lgQuery.addEventListener('change', onLg)
  measure()
  // Text metrics change once the web font is in; measure again then.
  document.fonts?.ready.then(measure).catch(() => {})
  ro = new ResizeObserver((entries) => {
    for (const e of entries) available.value = e.contentRect.width
  })
  watch(list, (el, old) => {
    if (old) ro?.unobserve(old)
    if (el) {
      ro?.observe(el)
      available.value = el.clientWidth
    }
  }, { immediate: true, flush: 'post' })
})
onBeforeUnmount(() => {
  ro?.disconnect()
  lgQuery?.removeEventListener('change', onLg)
})

// A removed chip's button is unmounted under the pointer or the keyboard; left
// alone the browser drops focus to <body>. Land on whatever slid into its place
// (the next chip, or the "+N" pill), else the one before it, else hand over to
// the page.
async function remove(index: number) {
  const id = visibleChips.value[index].id
  emit('remove', id)
  await nextTick()
  const buttons = list.value?.querySelectorAll<HTMLButtonElement>('button') ?? []
  const next = buttons[Math.min(index, buttons.length - 1)]
  if (next) next.focus()
  else emit('emptied')
}

async function clear() {
  emit('clear')
  await nextTick()
  emit('emptied')
}
</script>

<template>
  <div
    class="applied-filters-bar sticky top-[65px] z-40 -mx-4 sm:-mx-6 px-4 sm:px-6 mb-4 bg-light-bg dark:bg-dark-bg border-b border-light-border dark:border-dark-border lg:static lg:z-auto lg:mx-0 lg:px-0 lg:bg-transparent lg:dark:bg-transparent lg:border-0"
    :class="{ 'lg:hidden': chips.length === 0 }"
    data-testid="applied-filters-bar"
  >
    <div class="flex items-center gap-2 min-h-[48px]">
      <ul
        v-if="chips.length"
        ref="list"
        class="flex-1 lg:flex-initial min-w-0 flex items-center gap-1 overflow-hidden whitespace-nowrap lg:flex-wrap lg:overflow-visible lg:whitespace-normal"
        aria-label="Applied filters"
      >
        <li v-for="(chip, i) in visibleChips" :key="chip.id" class="shrink-0">
          <!--
            The whole chip is the button: a 44px-tall hit area around a small
            pill, and one Tab stop per filter rather than a label plus an x.
            The focus ring is drawn inside the box: the list clips overflow.
          -->
          <button
            type="button"
            class="inline-flex items-center min-h-[44px] px-0.5 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-link"
            :aria-label="`Remove filter: ${chip.label}`"
            @click="remove(i)"
          >
            <Badge :variant="chip.variant as any" :source-code="chip.sourceCode">
              {{ chip.label }}
              <svg class="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Badge>
          </button>
        </li>
        <li v-if="hiddenCount > 0" class="shrink-0">
          <button
            type="button"
            class="inline-flex items-center min-h-[44px] px-0.5 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-link"
            aria-haspopup="dialog"
            :aria-expanded="!!panelOpen"
            :aria-label="moreLabel"
            data-testid="applied-filters-more"
            @click="emit('open-panel')"
          >
            <Badge variant="default">+{{ hiddenCount }}</Badge>
          </button>
        </li>
      </ul>
      <div v-else class="flex-1" />
      <!--
        Only worth a control once there is more than one thing to clear, and
        only from 400px: on a narrower phone it would take the room the chips
        need, and the drawer's header carries a "Clear all" of its own.
      -->
      <button
        v-if="chips.length >= 2"
        type="button"
        class="shrink-0 min-h-[44px] px-2 text-sm text-brand-link hover:underline max-[399px]:hidden"
        @click="clear"
      >
        Clear all
      </button>
      <slot name="trailing" />
    </div>

    <!--
      The measuring copy: every chip and the widest "+N", laid out exactly as
      in the row but zero-sized, clipped and invisible, so it never paints,
      takes no room and reaches no one (no buttons, aria-hidden). Absent with
      no chips, so a page with no filters has no hidden pill in it at all.
    -->
    <div
      v-if="chips.length"
      ref="measureRow"
      class="absolute left-0 top-0 w-0 h-0 overflow-hidden invisible pointer-events-none"
      aria-hidden="true"
    >
      <div class="flex gap-1 whitespace-nowrap w-max">
        <span
          v-for="chip in chips"
          :key="chip.id"
          :data-chip-id="chip.id"
          class="inline-flex items-center min-h-[44px] px-0.5 shrink-0"
        >
          <Badge :variant="chip.variant as any" :source-code="chip.sourceCode">
            {{ chip.label }}
            <svg class="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" /></svg>
          </Badge>
        </span>
        <span data-more-pill class="inline-flex items-center min-h-[44px] px-0.5 shrink-0">
          <Badge variant="default">+{{ chips.length }}</Badge>
        </span>
      </div>
    </div>
  </div>
</template>

<style>
/*
 * Below `lg` two things are pinned at the top (header 65px, this bar 49px), so
 * keyboard focus scrolled into view must stop below both or it lands hidden
 * behind them (WCAG 2.4.11).
 */
@media (max-width: 1023.98px) {
  html:has(.applied-filters-bar) {
    scroll-padding-top: 8rem;
  }
}
</style>
