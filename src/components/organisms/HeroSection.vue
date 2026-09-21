<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'

/**
 * The opening of the site, written for the person who actually arrives here.
 *
 * That person is a compliance officer, an analyst, a journalist or a lawyer,
 * and they have come with a name in their head: is this company sanctioned,
 * and by whom. What was here before that question was a landing page — and
 * then, briefly, a very handsome one that answered it no better: an enormous
 * numeral, three columns of counts about the corpus, and the word "colophon".
 * All of it was information about the dataset rather than help with the task.
 *
 * So this says, in a sentence anyone can read, what the tool does; states when
 * the data was last built, because for sanctions work recency IS the trust
 * signal and burying it is close to negligent; and gives the search real
 * example queries, because an empty box on a specialist database tells a
 * newcomer nothing about what it will accept.
 *
 * The worked example sits in the `example` slot beside the search rather than
 * a scroll below it, so a first-time visitor sees the question and the shape
 * of the answer at the same time.
 *
 * Fetches nothing — tests/heroPayloadWiring.test.js holds it to that.
 */
const props = defineProps<{
  entityCount: number
  /**
   * How many lists the site COVERS — the catalogue count, not the number of
   * sources the current build happened to harvest. Those differ: the local
   * snapshot carries one, which rendered the opening sentence as "published by
   * 1 governments". A visitor is being told what the tool covers, so the
   * catalogue is the honest number; the harvest count belongs on the source
   * pages, where it is about a particular build.
   */
  sourceCount: number
  generatedAt: string
}>()

const router = useRouter()
const query = ref('')

const submit = () => {
  const q = query.value.trim()
  router.push(q ? { name: 'search', query: { q } } : { name: 'search' })
}

/** Real records in the published data, not invented placeholders. */
const examples = [
  { label: 'Lockheed Martin', q: 'Lockheed Martin' },
  { label: 'General Dynamics', q: 'General Dynamics' },
  { label: 'Hudson Institute', q: 'Hudson Institute' },
]

const runExample = (q: string) => router.push({ name: 'search', query: { q } })

/** "3 March 2026" — a date a person reads, never an ISO timestamp. */
const builtOn = computed(() => {
  if (!props.generatedAt) return ''
  const d = new Date(props.generatedAt)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
})
</script>

<template>
  <section class="hero-section border-b border-light-border dark:border-dark-border">
    <div class="container-register pt-12 pb-10 md:pt-16 md:pb-12">
      <div class="grid gap-10 lg:grid-cols-12 lg:gap-16 lg:items-start">
        <div class="lg:col-span-7">
          <h1
            class="font-display text-display-lg font-semibold text-light-text dark:text-dark-text text-balance"
          >
            Find out whether a person, company or vessel is under sanctions.
          </h1>

          <p class="mt-5 max-w-[58ch] text-lg text-light-muted dark:text-dark-muted">
            One searchable copy of the sanctions lists published by
            {{ sourceCount }} governments and international bodies — the UN, the EU,
            the United States, the United Kingdom and others. Free to search, and
            free to download in full.
          </p>

          <form class="mt-9" @submit.prevent="submit">
            <label
              for="register-search"
              class="block font-medium text-light-text dark:text-dark-text mb-2"
            >
              Search by name, country or identifier
            </label>
            <div class="flex gap-2">
              <input
                id="register-search"
                v-model="query"
                type="search"
                placeholder="e.g. Lockheed Martin"
                autocomplete="off"
                class="w-full border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface px-4 py-3 text-lg text-light-text dark:text-dark-text placeholder:text-light-muted dark:placeholder:text-dark-muted focus:outline-none focus:border-brand-link focus:ring-1 focus:ring-brand-link"
              />
              <button type="submit" class="btn-primary shrink-0 px-6">Search</button>
            </div>

            <p
              class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-light-muted dark:text-dark-muted"
            >
              <span>Try:</span>
              <button
                v-for="(ex, i) in examples"
                :key="ex.q"
                type="button"
                class="text-brand-link hover:underline focus-visible:underline"
                @click="runExample(ex.q)"
              >
                {{ ex.label
                }}<span
                  v-if="i < examples.length - 1"
                  class="text-light-muted dark:text-dark-muted"
                  >,</span
                >
              </button>
            </p>
          </form>

          <!--
            Recency is the first thing a compliance reader checks and the thing
            that decides whether they trust the answer. Stated plainly, in
            words, beside the record count — not buried in an About page.
          -->
          <p v-if="builtOn" class="mt-8 text-sm text-light-muted dark:text-dark-muted">
            <span class="font-medium text-light-text dark:text-dark-text">{{
              entityCount.toLocaleString()
            }}</span>
            records, last built on
            <span class="font-medium text-light-text dark:text-dark-text">{{ builtOn }}</span
            >. Always check the issuing authority before acting on a result.
          </p>
        </div>

        <aside class="lg:col-span-5">
          <slot name="example" />
        </aside>
      </div>
    </div>
  </section>
</template>
