<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { sources } from '@/config'
import { pillToneVars, tileToneVars } from '@/config/palette'
import { useSanctionsData } from '@/composables/useSanctionsData'

const { stats, loadStats } = useSanctionsData()

onMounted(() => {
  loadStats()
})

/**
 * The count badge for one browse card.
 *
 * These badges used to be literal strings baked into `browseOptions` below:
 * "6 laws", "17 groups", "17 announcements", "7 types", "8 orgs". They were
 * true of the China-only snapshot they were written against and wrong against
 * every deploy since — measured on the live endpoint on 2026-08-28, legal
 * instruments are 817, not 6, an error of 136x; document types 35, not 7;
 * organizations 37, not 8; groups 29, not 17.
 *
 * A badge with no derivation cannot stay right, so there is no literal left to
 * go stale. Until stats.json resolves the badge renders nothing rather than a
 * zero, because "0 laws" is a claim and a missing badge is not.
 */
function badge(key: keyof NonNullable<typeof stats.value>, noun: string): string {
  const n = stats.value?.[key]
  if (typeof n !== 'number') return ''
  return `${n.toLocaleString()} ${n === 1 ? noun.replace(/s$/, '') : noun}`
}

const counts = computed((): Record<string, string> => ({
  'Legal Instruments': badge('total_instruments', 'laws'),
  'Sanction Groups': badge('total_groups', 'groups'),
  // Announcements deliberately has no badge. `stats.json` publishes no
  // `total_announcements`, and `api/v1/index.jsonld` names no announcements
  // collection to count (checked live, 2026-08-28: the index lists 16 entries
  // and none of them is announcements or groups; api/v1/announcements/index.jsonld
  // is a 404). The old literal said "17 announcements" and the old "17 groups"
  // beside it suggests the two were the same number from the same snapshot.
  // Borrowing `total_groups` here would put back exactly the kind of unsourced
  // count this change exists to remove, so the badge stays absent until the
  // producer publishes one.
  'Document Types': badge('total_document_types', 'types'),
  Organizations: badge('total_organizations', 'orgs'),
}))

const browseOptions = [
  {
    title: 'Entities',
    description: 'Browse all sanctioned individuals, organizations, vessels, and aircraft.',
    icon: '👤',
    link: '/browse/entities',
    color: '#f59e0b',
  },
  {
    title: 'Sanctions',
    description: 'Browse sanction entries and measures.',
    icon: '📋',
    link: '/browse/sanctions',
    color: '#10b981',
  },
  {
    title: 'Actions',
    description: 'Browse enforcement actions and updates.',
    icon: '⚡',
    link: '/browse/actions',
    color: '#8b5cf6',
  },
]

const dataObjects = [
  {
    title: 'Legal Instruments',
    description: 'Laws, regulations, and legal documents that provide the basis for sanctions.',
    icon: '📜',
    link: '/browse/legal-instruments',
    color: '#3b82f6',
  },
  {
    title: 'Sanction Groups',
    description: 'Collections of sanctions announced together in a single announcement.',
    icon: '📁',
    link: '/browse/groups',
    color: '#ec4899',
  },
  {
    title: 'Announcements',
    description: 'Official announcements from sanctioning authorities.',
    icon: '📢',
    link: '/browse/announcements',
    color: '#06b6d4',
  },
  {
    title: 'Document Types',
    description: 'Types of official documents used in sanctions announcements.',
    icon: '📄',
    link: '/browse/document-types',
    color: '#f97316',
  },
  {
    title: 'Organizations',
    description: 'Government bodies, ministries, and agencies involved in sanctions.',
    icon: '🏛️',
    link: '/browse/organizations',
    color: '#84cc16',
  },
]
</script>

<template>
  <div class="min-h-screen">
    <div class="container-wide py-12">
      <h1 class="text-4xl font-bold mb-4 text-light-text dark:text-dark-text">
        Browse Data
      </h1>
      <p class="text-light-muted dark:text-dark-muted mb-8 max-w-3xl">
        Explore sanctions data by category. Use the options below to browse
        entities, sanctions, legal instruments, and more.
      </p>

      <!-- Primary Browse Options -->
      <div class="grid md:grid-cols-3 gap-6 mb-12">
        <RouterLink
          v-for="option in browseOptions"
          :key="option.link"
          :to="option.link"
          class="glass-card p-6 hover:border-brand-primary/50 transition-all group"
        >
          <div
            class="tone-pill w-12 h-12 rounded-lg flex items-center justify-center text-2xl mb-4"
            :style="pillToneVars(option.color)"
          >
            {{ option.icon }}
          </div>
          <h3 class="font-semibold text-lg mb-2 text-light-text dark:text-dark-text group-hover:text-brand-link transition-colors">
            {{ option.title }}
          </h3>
          <p class="text-light-muted dark:text-dark-muted text-sm">
            {{ option.description }}
          </p>
        </RouterLink>
      </div>

      <!-- Data Objects Section -->
      <section class="mb-12">
        <h2 class="text-2xl font-semibold mb-4 text-light-text dark:text-dark-text">
          Legal & Group Data
        </h2>
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <RouterLink
            v-for="obj in dataObjects"
            :key="obj.link"
            :to="obj.link"
            class="glass-card p-6 hover:border-brand-primary/50 transition-all group"
          >
            <div class="flex items-start justify-between mb-4">
              <div
                class="tone-pill w-12 h-12 rounded-lg flex items-center justify-center text-2xl"
                :style="pillToneVars(obj.color)"
              >
                {{ obj.icon }}
              </div>
              <span
                v-if="counts[obj.title]"
                class="text-xs px-2 py-1 rounded-full bg-light-bg dark:bg-dark-bg text-light-muted dark:text-dark-muted"
              >
                {{ counts[obj.title] }}
              </span>
            </div>
            <h3 class="font-semibold text-lg mb-2 text-light-text dark:text-dark-text group-hover:text-brand-link transition-colors">
              {{ obj.title }}
            </h3>
            <p class="text-light-muted dark:text-dark-muted text-sm">
              {{ obj.description }}
            </p>
          </RouterLink>
        </div>
      </section>

      <!-- Browse by Source -->
      <section class="mb-12">
        <h2 class="text-2xl font-semibold mb-4 text-light-text dark:text-dark-text">
          Browse by Source
        </h2>
        <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <RouterLink
            v-for="source in sources"
            :key="source.code"
            :to="{ name: 'search', query: { source: source.code } }"
            class="glass-card p-4 hover:border-brand-primary/50 transition-all group"
          >
            <div
              class="tone-tile w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm mb-3"
              :style="tileToneVars(source.color)"
            >
              {{ source.country }}
            </div>
            <h3 class="font-semibold text-light-text dark:text-dark-text group-hover:text-brand-link transition-colors">
              {{ source.name }}
            </h3>
          </RouterLink>
        </div>
      </section>

      <!-- Quick Links -->
      <section>
        <h2 class="text-2xl font-semibold mb-4 text-light-text dark:text-dark-text">
          Quick Links
        </h2>
        <div class="flex flex-wrap gap-4">
          <RouterLink to="/search" class="btn-primary">
            Search All Data
          </RouterLink>
          <RouterLink to="/api" class="btn-secondary">
            API Documentation
          </RouterLink>
        </div>
      </section>
    </div>
  </div>
</template>
