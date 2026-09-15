<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { sources } from '@/config'
import { fetchableSources } from '@/utils/sourceCatalog'
import { tileToneVars } from '@/config/palette'

const API_BASE = `${import.meta.env.BASE_URL || '/'}api/v1`

type SizeInfo = {
  bytes?: number
  display?: string
  exact: boolean
  asOf: string
}

type DownloadFile = {
  filename: string
  title: string
  description: string
  href: string
  sourceCode?: string
  sourceName?: string
  sourceCountry?: string
  sourceColor?: string
}

type CatalogueEntry = {
  name?: string
  url?: string
  bytes?: number
}

const fullJsonLd: DownloadFile = {
  filename: 'all.jsonld',
  title: 'Complete graph in JSON-LD',
  description: 'The complete published graph in JSON-LD format.',
  href: `${API_BASE}/all.jsonld`,
}

const fullTurtle: DownloadFile = {
  filename: 'all.ttl',
  title: 'Complete graph in Turtle',
  description: 'The complete published graph in RDF/Turtle format.',
  href: `${API_BASE}/all.ttl`,
}

const fullDownloads = [fullJsonLd, fullTurtle]

const publishedSourceCodes = new Set(fetchableSources())

const sourceDownloads: DownloadFile[] = sources
  .filter((source) => publishedSourceCodes.has(source.code))
  .map((source) => ({
    filename: `${source.code}.jsonld`,
    title: `${source.name} aggregate`,
    description: `All published entities and entries from ${source.name}.`,
    href: `${API_BASE}/sources/${encodeURIComponent(source.code)}.jsonld`,
    sourceCode: source.code,
    sourceName: source.name,
    sourceCountry: source.country,
    sourceColor: source.color,
  }))

const sizes = ref<Record<string, SizeInfo>>({
  [fullJsonLd.href]: {
    bytes: 156423069,
    exact: true,
    asOf: 'measured 14 September 2026',
  },
  [fullTurtle.href]: {
    display: '116 MB',
    exact: false,
    asOf: 'approximate; last measured 14 September 2026',
  },
})

const catalogueLoading = ref(true)

const sourceSizeState = computed(() => {
  if (catalogueLoading.value) return 'loading'

  return sourceDownloads.every((file) => sizes.value[file.href])
    ? 'ready'
    : 'unavailable'
})

function sizeFor(file: DownloadFile): SizeInfo | undefined {
  return sizes.value[file.href]
}

function formatBytes(bytes: number): string {
  const units = ['bytes', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0

  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit += 1
  }

  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

function sizeLabel(size: SizeInfo | undefined): string {
  if (!size) return 'Size unavailable'

  if (size.bytes !== undefined) {
    return `${formatBytes(size.bytes)} (${size.bytes.toLocaleString()} bytes; ${size.asOf})`
  }

  return `${size.display} (${size.asOf})`
}

function cataloguePath(value: string): string {
  const marker = '/api/v1/'
  const index = value.indexOf(marker)

  return index >= 0 ? value.slice(index + marker.length) : value.replace(/^\/+/, '')
}

function isCatalogueEntry(value: unknown): value is CatalogueEntry {
  if (typeof value !== 'object' || value === null) return false

  const entry = value as Record<string, unknown>

  return (
    (typeof entry.name === 'string' || typeof entry.url === 'string') &&
    (entry.bytes === undefined || typeof entry.bytes === 'number')
  )
}

function catalogueEntries(payload: unknown): CatalogueEntry[] {
  if (typeof payload !== 'object' || payload === null) return []

  const entries = (payload as { entries?: unknown }).entries

  return Array.isArray(entries) ? entries.filter(isCatalogueEntry) : []
}

function catalogueTimestamp(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined

  const generated = (payload as { generated?: unknown }).generated
  return typeof generated === 'string' ? generated : undefined
}

function matchesFile(entry: CatalogueEntry, file: DownloadFile): boolean {
  const expected = cataloguePath(file.href)
  const values = [entry.url, entry.name].filter(
    (value): value is string => typeof value === 'string',
  )

  return values.some((value) => {
    const candidate = cataloguePath(value)
    return candidate === expected || expected.endsWith(`/${candidate}`)
  })
}

onMounted(async () => {
  try {
    const response = await fetch(`${API_BASE}/index.jsonld`)
    if (!response.ok) throw new Error(`Catalogue request failed: ${response.status}`)

    const payload: unknown = await response.json()
    const entries = catalogueEntries(payload)
    const asOf = catalogueTimestamp(payload)
      ? `API catalogue generated ${catalogueTimestamp(payload)}`
      : 'current API catalogue'

    for (const file of [...fullDownloads, ...sourceDownloads]) {
      const entry = entries.find((candidate) => matchesFile(candidate, file))

      if (entry?.bytes !== undefined && Number.isFinite(entry.bytes) && entry.bytes > 0) {
        sizes.value[file.href] = {
          bytes: entry.bytes,
          exact: true,
          asOf,
        }
      }
    }
  } catch {
    // Full-file fallback measurements remain visible. Source links stay
    // unavailable because their size could not be verified.
  } finally {
    catalogueLoading.value = false
  }
})
</script>

<template>
  <div class="download-page min-h-screen">
    <div class="container-wide py-12">
      <header class="mb-10">
        <h1 class="text-4xl font-bold mb-4 text-light-text dark:text-dark-text">
          Download the data
        </h1>
        <p class="text-light-muted dark:text-dark-muted max-w-3xl">
          Choose the complete knowledge graph or download the lighter aggregate
          for one source.
        </p>
      </header>

      <section
        class="glass-card border-l-4 border-brand-accent p-6 mb-12"
        aria-labelledby="download-size-warning"
      >
        <h2
          id="download-size-warning"
          class="text-xl font-semibold mb-3 text-light-text dark:text-dark-text"
        >
          Check the size before downloading
        </h2>
        <p class="text-light-muted dark:text-dark-muted mb-5">
          The complete files are large. Choose a source aggregate if you only
          need one country or authority.
        </p>

        <dl class="grid sm:grid-cols-2 gap-4">
          <div>
            <dt class="text-sm text-light-muted dark:text-dark-muted">JSON-LD</dt>
            <dd class="font-semibold text-light-text dark:text-dark-text">
              {{ sizeLabel(sizeFor(fullJsonLd)) }}
            </dd>
          </div>
          <div>
            <dt class="text-sm text-light-muted dark:text-dark-muted">Turtle</dt>
            <dd class="font-semibold text-light-text dark:text-dark-text">
              {{ sizeLabel(sizeFor(fullTurtle)) }}
            </dd>
          </div>
        </dl>
      </section>

      <section class="mb-12" aria-labelledby="complete-downloads">
        <h2
          id="complete-downloads"
          class="text-2xl font-semibold mb-4 text-light-text dark:text-dark-text"
        >
          Complete dataset
        </h2>
        <p class="text-light-muted dark:text-dark-muted mb-6 max-w-3xl">
          These files contain the entire published graph. They are intended for
          local processing or archival use.
        </p>

        <ul class="grid md:grid-cols-2 gap-6">
          <li v-for="file in fullDownloads" :key="file.href">
            <article class="glass-card p-6 h-full flex flex-col">
              <h3 class="text-lg font-semibold text-light-text dark:text-dark-text">
                {{ file.title }}
              </h3>
              <p class="text-light-muted dark:text-dark-muted mt-2 mb-5">
                {{ file.description }}
              </p>

              <a
                :href="file.href"
                :download="file.filename"
                class="mt-auto inline-flex flex-wrap items-center gap-2 rounded border
                       border-light-border dark:border-dark-border px-4 py-2
                       text-brand-link hover:underline focus-visible:outline-none
                       focus-visible:ring-2 focus-visible:ring-brand-link
                       focus-visible:ring-offset-2 focus-visible:ring-offset-light-bg
                       dark:focus-visible:ring-offset-dark-bg"
              >
                <span>Download {{ file.filename }}</span>
                <span class="text-sm text-light-muted dark:text-dark-muted">
                  {{ sizeLabel(sizeFor(file)) }}
                </span>
              </a>
            </article>
          </li>
        </ul>
      </section>

      <section aria-labelledby="source-downloads">
        <h2
          id="source-downloads"
          class="text-2xl font-semibold mb-4 text-light-text dark:text-dark-text"
        >
          Download by source
        </h2>
        <p class="text-light-muted dark:text-dark-muted mb-4 max-w-3xl">
          Source aggregates are smaller alternatives to the complete graph.
          Each file contains the published data for one source.
        </p>

        <p
          v-if="sourceSizeState === 'loading'"
          class="text-sm text-light-muted dark:text-dark-muted mb-6"
          role="status"
        >
          Checking current source-file sizes before enabling downloads…
        </p>
        <p
          v-else-if="sourceSizeState === 'unavailable'"
          class="text-sm text-light-muted dark:text-dark-muted mb-6"
          role="status"
        >
          Some source files did not report a verifiable size, so those links
          remain unavailable until their size can be checked.
        </p>

        <ul class="grid md:grid-cols-2 gap-6">
          <li v-for="file in sourceDownloads" :key="file.href">
            <article class="glass-card p-6 h-full flex flex-col">
              <div class="flex items-start gap-3 mb-4">
                <div
                  class="tone-tile w-10 h-10 rounded-lg flex items-center justify-center
                         font-bold shrink-0"
                  :style="tileToneVars(file.sourceColor || '#0066cc')"
                >
                  {{ file.sourceCountry }}
                </div>
                <div class="min-w-0">
                  <h3 class="font-semibold text-lg text-light-text dark:text-dark-text">
                    {{ file.sourceName }}
                  </h3>
                  <p class="text-sm text-light-muted dark:text-dark-muted">
                    {{ file.filename }}
                  </p>
                </div>
              </div>

              <p class="text-light-muted dark:text-dark-muted mb-5">
                {{ file.description }}
              </p>

              <a
                v-if="sizeFor(file)"
                :href="file.href"
                :download="file.filename"
                class="mt-auto inline-flex flex-wrap items-center gap-2 rounded border
                       border-light-border dark:border-dark-border px-4 py-2
                       text-brand-link hover:underline focus-visible:outline-none
                       focus-visible:ring-2 focus-visible:ring-brand-link
                       focus-visible:ring-offset-2 focus-visible:ring-offset-light-bg
                       dark:focus-visible:ring-offset-dark-bg"
              >
                <span>Download {{ file.filename }}</span>
                <span class="text-sm text-light-muted dark:text-dark-muted">
                  {{ sizeLabel(sizeFor(file)) }}
                </span>
              </a>
              <p
                v-else
                class="mt-auto text-sm text-light-muted dark:text-dark-muted"
              >
                Size unavailable; download link withheld until it can be verified.
              </p>
            </article>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
