<script setup lang="ts">
import CodeBlock from '@/components/molecules/CodeBlock.vue'
import { pillToneVars, METHOD_SEED } from '@/config/palette'

const baseUrl = 'https://ammitto.github.io/api/v1'

const endpoints = [
  {
    method: 'GET',
    path: '/stats.json',
    description: 'Get overall statistics including entity counts by source.',
    example: `curl ${baseUrl}/stats.json`,
    response: `{
  "exported_at": "2024-01-15T00:00:00Z",
  "sources": {
    "eu": { "entities": 5860, "entries": 6234 },
    "un": { "entities": 877, "entries": 945 },
    "us": { "entities": 444, "entries": 512 },
    "wb": { "entities": 1370, "entries": 1420 }
  },
  "totals": { "entities": 8551, "entries": 9111 }
}`
  },
  {
    method: 'GET',
    path: '/sources/{source}.jsonld',
    description: 'Get all entities from a specific source in JSON-LD format.',
    example: `curl ${baseUrl}/sources/eu.jsonld`,
    response: `{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@id": "eu-entity-123",
      "@type": "PersonEntity",
      "entityType": "person",
      "names": [
        { "@type": "Name", "fullName": "John Doe", "isPrimary": true }
      ],
      "sourceReferences": [
        { "@type": "SourceReference", "sourceCode": "eu", "referenceNumber": "EU.123.45" }
      ]
    }
  ]
}`
  },
]

const codeExamples = {
  javascript: `// Fetch all EU entities
const response = await fetch('https://ammitto.github.io/api/v1/sources/eu.jsonld');
const data = await response.json();

// The graph holds entity AND sanction-entry nodes; entries carry no names
for (const node of data['@graph']) {
  if (!node['@id'].includes('/entity/')) continue;
  console.log(node.names?.[0]?.fullName);
}`,
  ruby: `require 'net/http'
require 'json'

# Fetch stats
uri = URI('https://ammitto.github.io/api/v1/stats.json')
response = Net::HTTP.get(uri)
stats = JSON.parse(response)

puts "Total entities: #{stats['totals']['entities']}"`,
  python: `import requests

# Fetch EU entities
response = requests.get('https://ammitto.github.io/api/v1/sources/eu.jsonld')
data = response.json()

# The graph holds entity AND sanction-entry nodes; entries carry no names
for node in data['@graph']:
    if '/entity/' not in node['@id']:
        continue
    for name in node.get('names', [])[:1]:
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
