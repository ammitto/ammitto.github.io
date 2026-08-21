<script setup lang="ts">
/**
 * The machine-readable documents behind whatever page you are on.
 *
 * Every record the site renders comes from a published JSON-LD document,
 * and until now nothing on the page said so or offered it. A researcher
 * who wants the record rather than the rendering had to know the API
 * exists, read its docs, and construct the path.
 *
 * Formats are what the producer actually publishes, not what would be
 * nice. Per-node and per-source documents are JSON-LD only; Turtle is
 * emitted for the whole graph and nothing smaller, so a `.ttl` link here
 * would 404. That is a producer limitation, not an oversight — see the
 * `all.ttl` note the caller can pass through `wholeGraphNote`.
 */
defineProps<{
  /** What the documents describe, e.g. "this entity" or "Australia". */
  subject: string
  documents: ReadonlyArray<{
    label: string
    href: string
    /** Shown beside the link — size, or what it contains. */
    note?: string
  }>
}>()
</script>

<template>
  <section
    v-if="documents.length"
    class="glass-card p-4 mt-8"
    aria-labelledby="source-documents-heading"
  >
    <h2
      id="source-documents-heading"
      class="text-sm font-semibold text-light-text dark:text-dark-text"
    >
      Data for {{ subject }}
    </h2>
    <p class="text-xs text-light-muted dark:text-dark-muted mt-1">
      The published documents this page is rendered from.
    </p>
    <ul class="mt-3 flex flex-wrap gap-2">
      <li v-for="doc in documents" :key="doc.href">
        <a
          :href="doc.href"
          download
          class="inline-flex items-center gap-2 rounded border border-light-border
                 dark:border-dark-border px-3 py-1.5 text-sm font-mono
                 text-light-text dark:text-dark-text
                 hover:bg-light-border/40 dark:hover:bg-dark-border/40
                 focus:outline-none focus:ring-2 focus:ring-offset-1"
        >
          <span aria-hidden="true">↓</span>
          <span>{{ doc.label }}</span>
          <span
            v-if="doc.note"
            class="text-xs font-sans text-light-muted dark:text-dark-muted"
          >{{ doc.note }}</span>
        </a>
      </li>
    </ul>
  </section>
</template>
