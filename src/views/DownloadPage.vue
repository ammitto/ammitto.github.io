<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
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
  published?: string
  digest?: string
  releaseTag?: string
  sourceCommit?: string
  mediaType?: string
}

const fullJsonLd = reactive<DownloadFile>({
  filename: 'all.jsonld',
  title: 'Complete graph in JSON-LD',
  description: 'The complete published graph in JSON-LD format.',
  href: '',
})

const fullTurtle = reactive<DownloadFile>({
  filename: 'all.ttl',
  title: 'Complete graph in Turtle',
  description: 'The complete published graph in RDF/Turtle format.',
  href: '',
})

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

const sizes = ref<Record<string, SizeInfo>>({})

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
  const expected = fullDownloads.includes(file) ? file.filename : cataloguePath(file.href)
  const values = [entry.url, entry.name].filter(
    (value): value is string => typeof value === 'string',
  )

  return values.some((value) => {
    const candidate = cataloguePath(value)
    return candidate === expected || expected.endsWith(`/${candidate}`)
  })
}

function validBulkEntry(entry: CatalogueEntry, file: DownloadFile, payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null) return false
  const release = (payload as { bulkRelease?: { tag?: string; url?: string; published?: string } }).bulkRelease
  if (!release || typeof release.tag !== 'string' || !/^api-v1-[a-f0-9]{40}$/.test(release.tag)) return false
  return entry.name === file.filename
    && entry.url === `https://github.com/ammitto/data/releases/download/${release.tag}/${file.filename}`
    && entry.mediaType === (file.filename.endsWith('.jsonld') ? 'application/ld+json' : 'text/turtle')
    && entry.releaseTag === release.tag && entry.sourceCommit === release.tag.slice('api-v1-'.length)
    && typeof entry.digest === 'string' && /^sha256:[a-f0-9]{64}$/.test(entry.digest)
    && typeof entry.published === 'string' && Number.isFinite(Date.parse(entry.published))
    && entry.published === release.published
    && release.url === `https://github.com/ammitto/data/releases/tag/${release.tag}`
}

async function verifySourceSize(file: DownloadFile): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch(file.href, { method: 'HEAD', signal: controller.signal })
    const type = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
    const encoding = response.headers.get('content-encoding')?.toLowerCase()
    const length = response.headers.get('content-length')
    const bytes = length && /^\d+$/.test(length) ? Number(length) : NaN
    // A SPA fallback or compressed transfer length cannot verify file size.
    if (response.ok && (type === 'application/ld+json' || type === 'application/json')
      && (!encoding || encoding === 'identity') && Number.isSafeInteger(bytes) && bytes > 0) {
      sizes.value[file.href] = { bytes, exact: true, asOf: 'verified from current file headers' }
    } else if (response.ok && (type === 'application/ld+json' || type === 'application/json')) {
      // Browsers negotiate compression on HEAD. A one-byte range response
      // reports the complete uncompressed file size without fetching the graph.
      const range = await fetch(file.href, { headers: { Range: 'bytes=0-0' }, signal: controller.signal })
      try {
        const rangeType = range.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
        const rangeEncoding = range.headers.get('content-encoding')?.toLowerCase()
        const match = /^bytes 0-0\/(\d+)$/i.exec(range.headers.get('content-range') || '')
        const total = match ? Number(match[1]) : NaN
        if (range.status === 206 && range.headers.get('content-length') === '1'
          && (rangeType === 'application/ld+json' || rangeType === 'application/json')
          && (!rangeEncoding || rangeEncoding === 'identity') && Number.isSafeInteger(total) && total > 0) {
          sizes.value[file.href] = { bytes: total, exact: true, asOf: 'verified from current file headers' }
        }
      } finally {
        await range.body?.cancel()
      }
    }
  } catch {
    // Keep the existing unavailable state when this file cannot be verified.
  } finally {
    clearTimeout(timeout)
  }
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

      if (entry?.bytes !== undefined && Number.isSafeInteger(entry.bytes) && entry.bytes > 0) {
        if (fullDownloads.includes(file)) {
          if (!entry.url) continue
          // Published bulk URLs pin an immutable release; never follow a mutable latest alias.
          if (/^https?:/.test(entry.url)) {
            if (!validBulkEntry(entry, file, payload)) continue
            file.href = entry.url
          } else {
            if (entry.url !== file.filename) continue
            file.href = API_BASE + '/' + entry.url
          }
        }
        sizes.value[file.href] = {
          bytes: entry.bytes,
          exact: true,
          asOf: entry.published ? `bulk release published ${entry.published}` : asOf,
        }
      }
    }
  } catch {
    // Without a verified catalogue, bulk links remain unavailable.
  } finally {
    // Published catalogues may omit source aggregates that are available.
    await Promise.all(sourceDownloads.filter(file => !sizes.value[file.href]).map(verifySourceSize))
    catalogueLoading.value = false
  }
})
</script>

<template>
  <div class="download-page min-h-screen">
    <div class="container-wide py-12">
      <header class="mb-10">
        <nav aria-label="Developer documentation" class="mb-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-brand-link">
          <a href="/api" class="underline underline-offset-4">API documentation</a>
          <a href="/schema" class="underline underline-offset-4">Data schema</a>
          <a href="/ontology" class="underline underline-offset-4">Ontology</a>
          <a href="/ruby" class="underline underline-offset-4">Ruby gem</a>
        </nav>
        <h1 class="text-4xl font-bold mb-4 text-light-text dark:text-dark-text">
          Download the data
        </h1>
        <p class="text-light-muted dark:text-dark-muted max-w-3xl">
          Choose the complete knowledge graph or download the lighter aggregate
          for one source.
        </p>
        <nav aria-label="Download options" class="mt-5 flex flex-wrap gap-5 text-sm text-brand-link">
          <a href="#complete-downloads" class="underline underline-offset-4">Complete dataset</a>
          <a href="#source-downloads" class="underline underline-offset-4">Download by source</a>
        </nav>
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
          local processing or archival use. Large exports are hosted in GitHub Releases;
          their release date can differ from the searchable site snapshot.
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
                v-if="sizeFor(file)"
                :href="file.href"
                :download="file.filename"
                class="mt-auto inline-flex flex-wrap items-center gap-2 rounded-sm border
                       border-light-border dark:border-dark-border px-4 py-2
                       text-brand-link hover:underline focus-visible:outline-hidden
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
                class="mt-auto inline-flex flex-wrap items-center gap-2 rounded-sm border
                       border-light-border dark:border-dark-border px-4 py-2
                       text-brand-link hover:underline focus-visible:outline-hidden
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

<style scoped>
.download-page h2 { scroll-margin-top: 1rem; }
</style>
