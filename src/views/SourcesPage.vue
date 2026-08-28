<script setup lang="ts">
import { computed, onMounted } from 'vue'
import SourceCard from '@/components/molecules/SourceCard.vue'
import { sources } from '@/config'
import { useSanctionsData } from '@/composables/useSanctionsData'

const { stats, loadStats, publishedSourceCount, generatedAt } = useSanctionsData()

/**
 * The data's own date, spelled for a reader.
 *
 * This page used to promise "synced daily" in two places. Nothing runs on a
 * timer: neither `.github/workflows/ci.yml` nor `deploy.yml` carried a
 * `schedule:` trigger, so the site rebuilt only when someone pushed to main —
 * and on 2026-08-28 the published data was generated 2026-08-21, the date of
 * the last push. A nightly schedule has since been added to deploy.yml, but
 * the promise is still the wrong thing to print: what a reader screening a
 * name needs is the date the data actually carries, not the cadence it is
 * meant to arrive on.
 */
const asOf = computed(() => {
  if (!generatedAt.value) return ''
  const d = new Date(generatedAt.value)
  if (Number.isNaN(d.getTime())) return ''
  // UTC, and labelled as such. `toLocaleString()` with no options rendered the
  // instant in the viewer's zone, so the date a screening result is filed under
  // changed with the reader's location.
  return `${d.toLocaleString('en-GB', {
    timeZone: 'UTC',
    dateStyle: 'long',
    timeStyle: 'short',
  })} UTC`
})

onMounted(() => {
  loadStats()
})
</script>

<template>
  <div class="min-h-screen">
    <div class="container-wide py-12">
      <h1 class="text-4xl font-bold mb-4 text-light-text dark:text-dark-text">
        Data Sources
      </h1>
      <p class="text-light-muted dark:text-dark-muted mb-8 max-w-3xl">
        <!--
          The number is omitted until it is known rather than falling back to
          `sources.length`. This page is prerendered by vite-ssg with no data
          fetched, so a fallback would bake the CATALOGUE figure (15) into the
          static HTML that crawlers read, and the client would then swap it for
          the published figure (14) — reintroducing, in the shipped bytes, the
          exact disagreement this change exists to remove.
        -->
        Ammitto aggregates sanctions data from<span v-if="publishedSourceCount">&nbsp;{{ publishedSourceCount }}</span>
        official international sources.
        <span v-if="asOf">Data as of {{ asOf }}.</span>
      </p>

      <div class="mb-8 p-4 glass-card">
        <div class="flex flex-wrap gap-8">
          <div>
            <!--
              Published sources, not catalogued sources. `config.sources` names
              15 because `sourceCatalog.ts` keeps a code listed while its data
              repo is pending (`ru`); the deploy publishes 14. Printing the
              catalogue figure here put "15" on this page while the home hero
              and /search both said "14".
            -->
            <div class="text-2xl font-bold text-brand-link">
              {{ publishedSourceCount || '—' }}
            </div>
            <div class="text-sm text-light-muted dark:text-dark-muted">
              Data Sources
            </div>
          </div>
          <div>
            <div class="text-2xl font-bold text-brand-link">
              {{ stats?.total_entities?.toLocaleString() || '—' }}
            </div>
            <div class="text-sm text-light-muted dark:text-dark-muted">
              Total Entities
            </div>
          </div>
          <!--
            "Total Entries" is shown only when it actually differs from
            "Total Entities". At the gem revision the deploy pins they are the
            same number — both 61,099 live on 2026-08-28 — so the page printed
            the identical figure twice under two labels, which reads as a
            miscount rather than as two measures that happen to agree.
          -->
          <div v-if="stats && stats.total_entries !== stats.total_entities">
            <div class="text-2xl font-bold text-brand-link">
              {{ stats.total_entries.toLocaleString() }}
            </div>
            <div class="text-sm text-light-muted dark:text-dark-muted">
              Total Entries
            </div>
          </div>
        </div>
      </div>

      <!--
        All fifteen catalogued sources are listed, including any the deploy does
        not yet publish — `sourceCatalog.ts` argues, correctly, that a source
        silently dropped from the catalogue is the worse bug. But the heading
        above counts the fourteen that ARE published, so the two must not be
        allowed to read as a miscount: a source with no published entities is
        marked as such on its own card.
      -->
      <div class="grid md:grid-cols-2 gap-6">
        <SourceCard
          v-for="source in sources"
          :key="source.code"
          :pending="!!stats && !stats.sources?.[source.code]"
          :counts-known="!!stats"
          :name="source.name"
          :full-name="source.fullName"
          :description="source.description"
          :entity-count="stats?.sources?.[source.code]?.entities"
          :entry-count="stats?.sources?.[source.code]?.entries"
          :color="source.color"
          :url="source.url"
          :authority="source.authority"
          :country="source.country"
        />
      </div>

      <div class="mt-12 p-6 glass-card">
        <h2 class="text-xl font-semibold mb-4 text-light-text dark:text-dark-text">
          Data Freshness
        </h2>
        <p class="text-light-muted dark:text-dark-muted">
          <template v-if="asOf">
            This data was generated
            <span class="font-medium text-light-text dark:text-dark-text">{{ asOf }}</span>
            from the official sources listed above. A rebuild runs nightly and
            whenever a change is pushed, so the date above — not a promised
            cadence — is what any result on this site is true as of.
          </template>
          <template v-else>
            Every result on this site is true as of the date the data was
            generated, shown here once the index has loaded.
          </template>
        </p>
        <p class="text-light-muted dark:text-dark-muted mt-2">
          Note: Some sources may have more recent updates than our last sync. Always verify
          critical information directly with the official source.
        </p>
      </div>
    </div>
  </div>
</template>
