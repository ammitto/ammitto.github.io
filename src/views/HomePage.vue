<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import HeroSection from '@/components/organisms/HeroSection.vue'
import { sources } from '@/config'
import { inkToneVars } from '@/config/palette'
import { normalizeNode } from '@/utils/normalizeNode'

/**
 * The front page, rebuilt around what a reader needs rather than what the
 * dataset contains.
 *
 * The previous version showed the corpus counted three ways — by authority, by
 * regime, by published list — each row with a proportional tally. It looked
 * considered and it helped nobody: a person checking whether a company is
 * sanctioned does not need to know that one regime holds 166 records and
 * another 83. It was data about the data.
 *
 * What is here now answers the three questions people actually arrive with:
 *   1. What is this, and is it current?      (HeroSection: plain sentence + build date)
 *   2. Let me look something up.             (HeroSection: search + real example queries)
 *   3. What will I actually get back?        (this file: one REAL record, in full)
 *
 * The sample record is fetched live rather than mocked up, so it can never
 * drift from what the site really serves, and it costs 573 bytes. If it is
 * missing the section simply does not render — a worked example is worth
 * having, but never worth a broken panel.
 *
 * The search index (megabytes) is still not loaded here. That stays on the
 * page that searches.
 */
const entityCount = ref(0)
const sourceCount = ref(0)
const generatedAt = ref('')
const sample = ref<Record<string, any> | null>(null)

const json = async (res: Response) => (res.ok ? await res.json() : null)

onMounted(async () => {
  try {
    const [statsRes, sampleRes] = await Promise.all([
      fetch('/api/v1/stats.json'),
      fetch('/api/v1/node/entity/cn/1-lockheed-martin-corporation.jsonld'),
    ])

    const stats = await json(statsRes)
    if (stats) {
      entityCount.value = stats.total_entities || 0
      sourceCount.value = Object.keys(stats.sources || {}).length
      generatedAt.value = stats.generated_at || ''
    }

    const node = await json(sampleRes)
    // Entity nodes come from the producer in JSON-LD; normalizeNode is
    // idempotent, so this is correct whether the published node is camelCase
    // or the older snake_case snapshot.
    if (node) sample.value = normalizeNode(node)
  } catch (e) {
    console.error('Failed to load the front page:', e)
  }
})

const sampleNames = computed<Array<{ full_name: string; script?: string; is_primary?: boolean }>>(
  () => sample.value?.names || [],
)
const samplePrimary = computed(
  () => sampleNames.value.find((n) => n.is_primary) || sampleNames.value[0],
)
const sampleOther = computed(() => sampleNames.value.filter((n) => n !== samplePrimary.value))
const sampleRef = computed(() =>
  String(sample.value?.id || '').replace('https://www.ammitto.org/entity/', ''),
)

/** What each source is, in words, rather than an acronym on a coloured tile. */
const sourceNote: Record<string, string> = {
  un: 'Binding on all UN member states.',
  un_vessels: 'Vessels designated by the Security Council.',
  eu: 'Applies across all EU member states.',
  eu_vessels: 'Vessels designated by the EU.',
  us: 'OFAC — the US Treasury list, including SDNs.',
  uk: 'OFSI — the UK financial sanctions list.',
  ca: 'Canadian autonomous and UN-implementing measures.',
  au: 'Australian autonomous and UN-implementing measures.',
  ch: 'Swiss measures and embargoes.',
  cn: 'Chinese counter-sanctions and export controls.',
  jp: 'Japanese asset-freeze designations.',
  nz: 'New Zealand autonomous measures.',
  ru: 'Russian counter-sanctions.',
  tr: 'Turkish asset-freeze designations.',
  wb: 'World Bank debarment — firms barred from funded contracts.',
}
</script>

<template>
  <div>
    <HeroSection
      :entity-count="entityCount"
      :source-count="sources.length"
      :generated-at="generatedAt"
    >
      <!-- A real record, so nobody has to search blind to see what they get. -->
      <template #example>
        <div
          v-if="samplePrimary"
          class="border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface p-6"
        >
          <p class="font-mono text-label uppercase text-light-muted dark:text-dark-muted">
            A record, in full
          </p>
          <p class="mt-4 font-display text-2xl font-semibold text-light-text dark:text-dark-text">
          {{ samplePrimary.full_name }}
        </p>

        <dl class="mt-5 grid gap-x-8 gap-y-4">
          <div v-if="sampleOther.length">
            <dt class="text-sm text-light-muted dark:text-dark-muted">Also listed as</dt>
            <dd class="mt-1 text-light-text dark:text-dark-text">
              {{ sampleOther.map((n) => n.full_name).join(' · ') }}
            </dd>
          </div>
          <div v-if="sample?.entity_type">
            <dt class="text-sm text-light-muted dark:text-dark-muted">Type</dt>
            <dd class="mt-1 capitalize text-light-text dark:text-dark-text">
              {{ sample.entity_type }}
            </dd>
          </div>
          <div v-if="sample?.remarks">
            <dt class="text-sm text-light-muted dark:text-dark-muted">Published note</dt>
            <dd class="mt-1 text-light-text dark:text-dark-text">{{ sample.remarks }}</dd>
          </div>
          <div v-if="sampleRef">
            <dt class="text-sm text-light-muted dark:text-dark-muted">Reference</dt>
            <dd class="mt-1 font-mono text-sm text-light-text dark:text-dark-text">
              {{ sampleRef }}
            </dd>
          </div>
        </dl>

          <RouterLink
            v-if="sampleRef"
            :to="`/entity/${sampleRef}`"
            class="inline-block mt-6 font-medium text-brand-link hover:underline"
          >
            See the full record &rarr;
          </RouterLink>
        </div>
      </template>
    </HeroSection>

    <section class="container-register py-12 md:py-16">
      <h2 class="font-display text-display-md font-semibold text-light-text dark:text-dark-text">
        Where the data comes from
      </h2>
      <p class="mt-3 max-w-[60ch] text-light-muted dark:text-dark-muted">
        Each list is read from the authority that publishes it. Nothing is merged:
        a company named by four governments keeps four separate entries, so you can
        always see who said what.
      </p>

      <ul class="mt-7 grid gap-x-12 md:grid-cols-2">
        <li v-for="source in sources" :key="source.code">
          <RouterLink
            :to="{ name: 'search', query: { source: source.code } }"
            class="source-row grid grid-cols-[2.5rem_1fr] gap-x-4 items-baseline border-b border-light-border dark:border-dark-border py-3.5 pl-3 -ml-3 border-l-2 border-l-transparent"
            :style="inkToneVars(source.color)"
          >
            <span class="tone-ink font-mono text-sm font-medium">{{ source.country }}</span>
            <span>
              <span class="font-medium text-light-text dark:text-dark-text">
                {{ source.name }}
              </span>
              <span class="block text-sm text-light-muted dark:text-dark-muted">
                {{ sourceNote[source.code] || source.authority }}
              </span>
            </span>
          </RouterLink>
        </li>
      </ul>
    </section>

    <section class="border-t border-light-border dark:border-dark-border">
      <div class="container-register py-12 md:py-14">
        <div class="grid gap-8 lg:grid-cols-12 lg:gap-14">
          <div class="lg:col-span-7">
            <h2 class="font-display text-display-md font-semibold text-light-text dark:text-dark-text">
              Using this in your own systems
            </h2>
            <p class="mt-3 max-w-[58ch] text-light-muted dark:text-dark-muted">
              The whole dataset is available over HTTP as structured JSON, and can be
              downloaded in full. There is no sign-up, no rate limit and no API key —
              every endpoint is just a file.
            </p>
          </div>
          <div class="lg:col-span-5 flex flex-wrap items-start gap-3 lg:justify-end">
            <RouterLink to="/api" class="btn-primary">Read the API docs</RouterLink>
            <RouterLink to="/sources" class="btn-secondary">All sources</RouterLink>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Additive only: the row is fully readable before the pointer arrives. */
.source-row {
  transition: background-color 0.16s ease, border-left-color 0.16s ease;
}
.source-row:hover,
.source-row:focus-visible {
  background-color: rgb(var(--color-brand-link) / 0.06);
  border-left-color: rgb(var(--color-brand-link));
}
@media (prefers-reduced-motion: reduce) {
  .source-row {
    transition: none;
  }
}
</style>
