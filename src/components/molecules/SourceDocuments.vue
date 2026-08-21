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
 * would 404. That is a producer limitation, not an oversight. A caller that
 * wants to mention `all.ttl` says so in its own copy; this component takes
 * no prop for it.
 */
defineProps<{
  /** What the documents describe, e.g. "this entity" or "Australia". */
  subject: string
  documents: ReadonlyArray<{
    // Also the saved filename. A bare `download` takes the name from the
    // URL's last segment, so `uk/aqd0087.jsonld` saved as `aqd0087.jsonld`
    // and a folder of them lost which source each came from. The labels are
    // already filename-shaped and slash-sanitised by their callers.
    label: string
    href: string
    /** Shown beside the link — size, or what it contains. */
    note?: string
  }>
}>()
</script>

<template>
  <!--
    aria-label rather than aria-labelledby: the heading inside a <section>
    does NOT give the region a programmatic name, and a hardcoded id would
    collide the moment two of these render on one page. Labelling from the
    prop gives each instance its own name with no id at all.
  -->
  <section
    v-if="documents.length"
    class="glass-card p-4 mt-8"
    :aria-label="`Data for ${subject}`"
  >
    <h2 class="text-sm font-semibold text-light-text dark:text-dark-text">
      Data for {{ subject }}
    </h2>
    <p class="text-xs text-light-muted dark:text-dark-muted mt-1">
      The published documents this page is rendered from.
    </p>
    <!--
      No decorative glyph. A span containing only "↓" made axe decline to
      decide the contrast of that node — "Element content contains only
      non-text characters ... nonBmp" — and the contrast gate treats
      undecidable as failing. The word "download" on the anchor and the
      note beside it already say what the control does.

      min-w-0 plus break-all because a flex item defaults to min-width:auto
      and will not shrink below its content: a long source/id in a
      monospace label overflowed 320px, which the e2e overflow sweep checks
      on every route in both themes.
    -->
    <ul class="mt-3 flex flex-wrap gap-2">
      <li
        v-for="doc in documents"
        :key="doc.href"
        class="min-w-0 max-w-full"
      >
        <a
          :href="doc.href"
          :download="doc.label"
          class="inline-flex max-w-full items-center gap-2 rounded border
                 border-light-border dark:border-dark-border px-3 py-1.5
                 text-sm text-light-text dark:text-dark-text
                 hover:bg-light-border/40 dark:hover:bg-dark-border/40
                 focus:outline-none focus:ring-2 focus:ring-offset-1"
        >
          <span class="font-mono break-all min-w-0">{{ doc.label }}</span>
          <span
            v-if="doc.note"
            class="text-xs text-light-muted dark:text-dark-muted break-words min-w-0"
          >{{ doc.note }}</span>
        </a>
      </li>
    </ul>
  </section>
</template>
