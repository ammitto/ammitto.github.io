<script setup lang="ts">
import CodeBlock from '@/components/molecules/CodeBlock.vue'
import { pillToneVars, METHOD_SEED } from '@/config/palette'

const baseUrl = 'https://www.ammitto.org/api/v1'

// Every path below is taken from the catalogue the producer publishes at
// /index.jsonld, and every response shape from a live fetch of that path.
// The page used to list two endpoints against a base URL that redirects,
// with a @context we do not emit and counts from a corpus a seventh the
// size of today's. Start from the catalogue when this needs updating.
const endpoints = [
  {
    method: 'GET',
    path: '/index.jsonld',
    description:
      'Catalogue of everything a run published: each file with its media type and byte size, each collection with its members. Start here rather than guessing a path.',
    example: `curl ${baseUrl}/index.jsonld`,
    response: `{
  "@context": "https://ammitto.org/api/v1/context.jsonld",
  "@type": "Index",
  "slice": "catalogue",
  "generated": "2026-08-20T13:30:48Z",
  "entries": [
    {
      "name": "all.jsonld",
      "url": "all.jsonld",
      "mediaType": "application/ld+json",
      "description": "Every node in one graph",
      "bytes": 155683385
    },
    {
      "name": "sources",
      "url": "sources",
      "description": "One aggregate per source",
      "members": ["au.jsonld", "ca.jsonld", "ch.jsonld", "..."]
    }
  ]
}`
  },
  {
    method: 'GET',
    path: '/stats.json',
    description: 'Entity and entry counts per source, and the totals. About 1 KB — read this rather than counting a larger file.',
    example: `curl ${baseUrl}/stats.json`,
    response: `{
  "generated_at": "2026-08-20T13:30:48Z",
  "sources": {
    "eu": { "entities": 6329, "entries": 6329 },
    "us": { "entities": 19207, "entries": 19207 },
    "uk": { "entities": 6349, "entries": 6349 }
  },
  "total_entities": 61051,
  "total_entries": 61051,
  "total_regimes": 179
}`
  },
  {
    method: 'GET',
    path: '/sources/{source}.jsonld',
    description: 'Every entity and entry from one source, as JSON-LD. Fourteen sources publish today; the catalogue lists them.',
    example: `curl ${baseUrl}/sources/eu.jsonld`,
    response: `{
  "@context": "https://ammitto.org/api/v1/context.jsonld",
  "@graph": [
    {
      "@id": "https://www.ammitto.org/entity/eu/13",
      "@type": "PersonEntity",
      "entityType": "person",
      "names": [
        { "@type": "NameVariant", "fullName": "…", "script": "Latn", "isPrimary": true }
      ]
    }
  ]
}`
  },
  {
    method: 'GET',
    path: '/node/entity/{source}/{id}.jsonld',
    description: 'One entity on its own. Cheaper than the source aggregate when you already know the identifier; /node/entity/index.jsonld lists them.',
    example: `curl ${baseUrl}/node/entity/au/100.jsonld`,
    response: `{
  "@id": "https://www.ammitto.org/entity/au/100",
  "@type": "PersonEntity",
  "entityType": "person",
  "names": [
    { "@type": "NameVariant", "fullName": "Nazir Mohammad Abdul Basir", "script": "Latn", "isPrimary": true },
    { "@type": "NameVariant", "fullName": "Nazar Mohammad", "script": "Latn", "isPrimary": false }
  ]
}`
  },
  {
    method: 'GET',
    path: '/all.jsonld and /all.ttl',
    description:
      'The whole graph in one file — JSON-LD or RDF/Turtle. Large: 155 MB and 115 MB respectively, though the JSON-LD transfers at about 8 MB gzipped. Prefer a source aggregate or a node document unless you genuinely want everything.',
    example: `curl -H 'Accept-Encoding: gzip' ${baseUrl}/all.jsonld`,
    response: `{
  "@context": "https://ammitto.org/api/v1/context.jsonld",
  "@graph": [ /* every entity, entry, regime, authority and instrument */ ]
}`
  },
  {
    method: 'GET',
    path: '/ontology/classes.jsonld',
    description:
      'The published vocabulary: 18 classes, with properties.jsonld and hierarchy.json beside it. context.jsonld at the root maps the terms every document above uses.',
    example: `curl ${baseUrl}/ontology/classes.jsonld`,
    response: `{
  "@context": "https://ammitto.org/api/v1/context.jsonld",
  "@graph": [
    {
      "@id": "https://www.ammitto.org/ontology/Entity",
      "@type": "rdfs:Class",
      "label": "Entity",
      "comment": "Base class for all sanctionable entities"
    }
  ]
}`
  },
  {
    method: 'GET',
    path: '/facets/{facet}.json',
    description: 'Value lists for filtering — types, authorities, regimes, list types, countries, statuses — each with a count.',
    example: `curl ${baseUrl}/facets/types.json`,
    response: `{
  "facets": [
    { "code": "person", "name": "Person", "icon": "user", "count": 31239 },
    { "code": "organization", "name": "Organization", "icon": "building", "count": 26819 },
    { "code": "vessel", "name": "Vessel", "icon": "ship", "count": 2651 }
  ]
}`
  },
]

const codeExamples = {
  javascript: `// Ask the catalogue what exists before fetching anything
const index = await (await fetch('${baseUrl}/index.jsonld')).json();
for (const entry of index.entries) {
  console.log(entry.name, entry.bytes ?? \`\${entry.members?.length ?? 0} members\`);
}

// Then take one source
const data = await (await fetch('${baseUrl}/sources/eu.jsonld')).json();

// The graph holds entity AND sanction-entry nodes; entries carry no names
for (const node of data['@graph']) {
  if (!node['@id'].includes('/entity/')) continue;
  console.log(node.names?.[0]?.fullName);
}`,
  ruby: `require 'net/http'
require 'json'

stats = JSON.parse(Net::HTTP.get(URI('${baseUrl}/stats.json')))

# The totals are top-level keys, not nested under "totals"
puts "Entities: #{stats['total_entities']} across #{stats['sources'].size} sources"

stats['sources'].each { |code, c| puts "  #{code}: #{c['entities']}" }`,
  python: `import requests

BASE = '${baseUrl}'

# One entity, by identifier — far cheaper than the source aggregate
node = requests.get(f'{BASE}/node/entity/au/100.jsonld').json()
print(node['@type'], node['names'][0]['fullName'])

# Or a whole source
data = requests.get(f'{BASE}/sources/eu.jsonld').json()
for n in data['@graph']:
    if '/entity/' not in n['@id']:
        continue
    for name in n.get('names', [])[:1]:
        if name.get('fullName'):
            print(name['fullName'])`,
}
</script>

<template>
  <div class="min-h-screen">
    <div class="container-wide py-12">
      <h1 class="text-4xl font-bold mb-4 text-light-text dark:text-dark-text">
        API Documentation
      </h1>
      <p class="text-light-muted dark:text-dark-muted mb-8 max-w-3xl">
        Access sanctions data through our free, public API. No API key required.
      </p>

      <section class="mb-12">
        <h2 class="text-2xl font-semibold mb-4 text-light-text dark:text-dark-text">
          Base URL
        </h2>
        <CodeBlock
          :code="baseUrl"
          title="Base URL"
        />
      </section>

      <section class="mb-12">
        <h2 class="text-2xl font-semibold mb-4 text-light-text dark:text-dark-text">
          Endpoints
        </h2>
        <div class="space-y-6">
          <div v-for="endpoint in endpoints" :key="endpoint.path" class="glass-card p-6">
            <!-- flex-wrap + break-all: endpoint paths are unbreakable strings
                 and pushed the page past a 320px viewport. -->
            <div class="flex flex-wrap items-center gap-3 mb-3">
              <!-- Was bg-green-500/20 text-green-600: green on green, 2.74:1
                   in light and 3.73:1 in dark. The method chip now takes the
                   same per-theme tone derivation as the badges. -->
              <span
                class="tone-pill px-2 py-1 rounded text-xs font-bold"
                :style="pillToneVars(METHOD_SEED)"
              >
                {{ endpoint.method }}
              </span>
              <code class="font-mono break-all text-light-text dark:text-dark-text">{{ endpoint.path }}</code>
            </div>
            <p class="text-light-muted dark:text-dark-muted mb-4">
              {{ endpoint.description }}
            </p>
            <CodeBlock
              :code="endpoint.example"
              language="bash"
              title="Example Request"
            />
            <div class="mt-4">
              <CodeBlock
                :code="endpoint.response"
                language="json"
                title="Example Response"
              />
            </div>
          </div>
        </div>
      </section>

      <section class="mb-12">
        <h2 class="text-2xl font-semibold mb-4 text-light-text dark:text-dark-text">
          Code Examples
        </h2>

        <div class="space-y-6">
          <div>
            <h3 class="text-lg font-medium mb-3 text-light-text dark:text-dark-text">JavaScript</h3>
            <CodeBlock :code="codeExamples.javascript" language="javascript" />
          </div>

          <div>
            <h3 class="text-lg font-medium mb-3 text-light-text dark:text-dark-text">Ruby</h3>
            <CodeBlock :code="codeExamples.ruby" language="ruby" />
          </div>

          <div>
            <h3 class="text-lg font-medium mb-3 text-light-text dark:text-dark-text">Python</h3>
            <CodeBlock :code="codeExamples.python" language="python" />
          </div>
        </div>
      </section>

      <section class="mb-12">
        <h2 class="text-2xl font-semibold mb-4 text-light-text dark:text-dark-text">
          Rate Limits
        </h2>
        <p class="text-light-muted dark:text-dark-muted">
          There are no strict rate limits, but please be respectful of the service.
          For high-volume access, consider downloading the data files and hosting them locally.
        </p>
      </section>
    </div>
  </div>
</template>
