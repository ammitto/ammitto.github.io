<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import Badge from '@/components/atoms/Badge.vue'
import CountryTile from '@/components/atoms/CountryTile.vue'
import { sources, entityTypes } from '@/config'
import { inkToneVars } from '@/config/palette'

interface Entity {
  id: string
  ref?: string // Short reference for clean URLs (e.g., "cn/CN-ACT1 Federal")
  names: string[]
  entityType: string
  source: string
  status: string
  listedDate?: string
  country?: string
  birthDate?: string
}

const props = defineProps<{
  entity: Entity
}>()

const primaryName = computed(() => props.entity.names[0] || 'Unknown')
const aliases = computed(() => props.entity.names.slice(1, 4))
const sourceInfo = computed(() => sources.find((s) => s.code === props.entity.source))
const typeInfo = computed(() => entityTypes.find((t) => t.code === props.entity.entityType))
</script>

<template>
  <!--
    A ruled register row, not a card.
    ---------------------------------
    This used to be a bordered, rounded, padded box in a two-up grid: roughly
    ten results on a laptop screen, each one an island. A sanctions search
    returns hundreds of rows and the reader is scanning for one name, so the
    box was costing the only thing that matters here — how many candidates you
    can compare at once. As a row with a hairline under it, the same screen
    carries two to three times as many, and the names line up in a column the
    eye can run down.

    KEPT FROM THE PREVIOUS VERSION, deliberately:

    - A RouterLink wrapping the whole row, because the only thing this does is
      go to /entity/<ref>. It was an <article> with a @click handler once:
      nothing focusable, no role, no Enter activation. Routing through
      RouterLink also restores middle-click, ctrl-click, copy-link-address and
      a real href for crawlers. This stays valid only while no descendant is
      itself interactive — every child here is a Badge, which renders a <span>.

    - The path is interpolated rather than passed as a route param, so the
      slash in a ref like `uk/aqd0087` stays a separator instead of %2F.

    - min-w-0 is load-bearing, not decoration. As a grid item this defaults to
      min-width:auto, and the name lines are `truncate` (white-space: nowrap),
      whose min-content is the FULL untruncated string. One long sanctioned
      name stretched the whole grid and the page with it — 1044px of
      scrollWidth in a 390px viewport. min-w-0 lets the track ignore that
      intrinsic width so the truncation can do its job.
      tests/e2e/overflow.spec.js holds this at 320px and 390px on every route.

    - The user agent's own focus ring. It is deliberately NOT suppressed: a
      keyboard user tabbing a list of forty-odd rows needs an indicator that
      survives every theme, and the accent bar this row draws on hover is a
      2px edge — too quiet to be the only signal. The scoped :focus-visible
      rule below adds the bar on top of the native ring rather than replacing
      it. tests/cardNavigationWiring.test.js enforces the pairing.

    - A Badge for the type, which renders `.tone-pill`. tests/routes.js uses
      that selector to prove /search actually rendered its theme-derived
      colours before the contrast scan runs, so it must survive here.
  -->
  <RouterLink
    :to="`/entity/${entity.ref}`"
    class="entity-row grid min-w-0 grid-cols-1 items-baseline gap-x-6 gap-y-1 border-b border-light-border dark:border-dark-border border-l-2 border-l-transparent py-3.5 pl-3 -ml-3 sm:grid-cols-[minmax(0,1fr)_auto]"
  >
    <div class="min-w-0">
      <h3
        class="truncate font-display text-lg font-semibold text-light-text dark:text-dark-text"
      >
        {{ primaryName }}
      </h3>
      <p
        v-if="aliases.length"
        class="truncate text-sm text-light-muted dark:text-dark-muted"
      >
        Also known as {{ aliases.join(' · ') }}
      </p>
    </div>

    <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 sm:justify-end">
      <!--
        The issuing authority is the single most important fact about a result
        after the name — it is who says this entity is sanctioned. It gets the
        source's own colour as a mono tick rather than a pill, so it reads at a
        glance down the column without competing with the name.
      -->
      <span
        v-if="sourceInfo"
        class="tone-ink font-mono text-xs font-medium uppercase"
        :style="inkToneVars(sourceInfo.color)"
      >
        {{ sourceInfo.name }}
      </span>

      <Badge :variant="entity.entityType as any">
        <CountryTile
          v-if="sourceInfo"
          :code="sourceInfo.country"
          :color="sourceInfo.color"
        />
        {{ typeInfo?.name }}
      </Badge>

      <span
        v-if="entity.status"
        class="font-mono text-xs uppercase text-light-muted dark:text-dark-muted"
      >
        {{ entity.status }}
      </span>

      <span
        v-if="entity.country"
        class="min-w-0 font-mono text-xs uppercase text-light-muted [overflow-wrap:anywhere] dark:text-dark-muted"
      >
        {{ entity.country }}
      </span>

      <span
        v-if="entity.birthDate"
        class="min-w-0 font-mono text-xs text-light-muted [overflow-wrap:anywhere] dark:text-dark-muted"
      >
        Born: {{ entity.birthDate }}
      </span>
    </div>
  </RouterLink>
</template>

<style scoped>
/* Additive: the row is fully readable before the pointer arrives. */
.entity-row {
  transition: background-color 0.14s ease, border-left-color 0.14s ease;
}
.entity-row:hover,
.entity-row:focus-visible {
  background-color: rgb(var(--color-brand-link) / 0.06);
  border-left-color: rgb(var(--color-brand-link));
}
@media (prefers-reduced-motion: reduce) {
  .entity-row {
    transition: none;
  }
}
</style>
