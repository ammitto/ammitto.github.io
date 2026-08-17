<script setup lang="ts">
import CodeBlock from '@/components/molecules/CodeBlock.vue'

const entitySchema = `{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@id": "string",
      "@type": "PersonEntity | OrganizationEntity | VesselEntity | AircraftEntity",
      "entityType": "person | organization | vessel | aircraft",
      "names": [
        {
          "@type": "Name",
          "fullName": "string",
          "isPrimary": "boolean"
        }
      ],
      "sourceReferences": [
        {
          "@type": "SourceReference",
          "sourceCode": "string",
          "referenceNumber": "string"
        }
      ],
      "birthInfo": [
        {
          "@type": "BirthInfo",
          "date": "string (optional)",
          "country": "string (optional)"
        }
      ],
      "addresses": [
        {
          "@type": "Address",
          "street": "string (optional)",
          "city": "string (optional)",
          "state": "string (optional)",
          "country": "string (optional)",
          "postalCode": "string (optional)"
        }
      ],
      "remarks": "string (optional)"
    }
  ]
}`

const entityTypeDescriptions = [
  // gender, title and imoNumber are named because the producer publishes
  // them and this table is where an API consumer looks to find out what a
  // node carries. Leaving a published field out of it is the same untruth
  // as documenting one that is never emitted.
  {
    type: 'PersonEntity',
    description: 'An individual person subject to sanctions.',
    fields: 'names, birthInfo, addresses, gender, title, position, remarks',
  },
  {
    type: 'OrganizationEntity',
    description: 'A company, organization, or other legal entity subject to sanctions.',
    fields: 'names, addresses, remarks',
  },
  // addresses is gone from these two because it was never theirs. The gem
  // declares the attribute on PersonEntity and OrganizationEntity only —
  // VesselEntity, AircraftEntity and the Entity base class they inherit
  // from have no such attribute under any spelling — and no published
  // vessel or aircraft node carries the key. This is the `contact` case,
  // not the `contact_info` one: not an unpopulated field, but a field that
  // does not exist in the vocabulary.
  {
    type: 'VesselEntity',
    description: 'A ship or maritime vessel subject to sanctions.',
    fields: 'names, imoNumber, remarks',
  },
  {
    type: 'AircraftEntity',
    description: 'An aircraft subject to sanctions.',
    fields: 'names, remarks',
  },
]
</script>

<template>
  <div class="min-h-screen">
    <div class="container-wide py-12">
      <h1 class="text-4xl font-bold mb-4 text-light-text dark:text-dark-text">
        Data Schema
      </h1>
      <p class="text-light-muted dark:text-dark-muted mb-8 max-w-3xl">
        Ammitto uses JSON-LD format for all data, providing semantic web compatibility
        and easy integration with modern applications.
      </p>

      <section class="mb-12">
        <h2 class="text-2xl font-semibold mb-4 text-light-text dark:text-dark-text">
          Entity Types
        </h2>
        <div class="grid md:grid-cols-2 gap-4">
          <div
            v-for="type in entityTypeDescriptions"
            :key="type.type"
            class="glass-card p-4"
          >
            <h3 class="font-semibold text-light-text dark:text-dark-text">
              {{ type.type }}
            </h3>
            <p class="text-sm text-light-muted dark:text-dark-muted mt-2">
              {{ type.description }}
            </p>
            <div class="mt-3 text-xs font-mono text-light-muted dark:text-dark-muted">
              Fields: {{ type.fields }}
            </div>
          </div>
        </div>
      </section>

      <section class="mb-12">
        <h2 class="text-2xl font-semibold mb-4 text-light-text dark:text-dark-text">
          Full Schema
        </h2>
        <CodeBlock
          :code="entitySchema"
          language="json"
          title="Entity Schema"
        />
      </section>

      <section class="mb-12">
        <h2 class="text-2xl font-semibold mb-4 text-light-text dark:text-dark-text">
          Field Descriptions
        </h2>
        <div class="glass-card overflow-hidden">
          <table class="w-full">
            <thead>
              <tr class="border-b border-light-border dark:border-dark-border">
                <th class="text-left p-4 font-semibold">Field</th>
                <th class="text-left p-4 font-semibold">Type</th>
                <th class="text-left p-4 font-semibold">Description</th>
              </tr>
            </thead>
            <tbody class="text-light-muted dark:text-dark-muted">
              <tr class="border-b border-light-border dark:border-dark-border">
                <td class="p-4 font-mono text-sm">@id</td>
                <td class="p-4">string</td>
                <td class="p-4">Unique identifier for the entity</td>
              </tr>
              <tr class="border-b border-light-border dark:border-dark-border">
                <td class="p-4 font-mono text-sm">@type</td>
                <td class="p-4">string</td>
                <td class="p-4">Entity type (PersonEntity, OrganizationEntity, etc.)</td>
              </tr>
              <tr class="border-b border-light-border dark:border-dark-border">
                <td class="p-4 font-mono text-sm">entityType</td>
                <td class="p-4">string</td>
                <td class="p-4">Normalized entity type (person, organization, vessel, aircraft)</td>
              </tr>
              <tr class="border-b border-light-border dark:border-dark-border">
                <td class="p-4 font-mono text-sm">names</td>
                <td class="p-4">array</td>
                <td class="p-4">Array of name objects with fullName and isPrimary flag</td>
              </tr>
              <tr class="border-b border-light-border dark:border-dark-border">
                <td class="p-4 font-mono text-sm">sourceReferences</td>
                <td class="p-4">array</td>
                <td class="p-4">Array of source reference objects</td>
              </tr>
              <tr class="border-b border-light-border dark:border-dark-border">
                <td class="p-4 font-mono text-sm">birthInfo</td>
                <td class="p-4">array</td>
                <td class="p-4">Birth date and country information (persons only)</td>
              </tr>
              <tr class="border-b border-light-border dark:border-dark-border">
                <td class="p-4 font-mono text-sm">addresses</td>
                <td class="p-4">array</td>
                <!--
                  Scoped the way the birthInfo row above it already is.
                  Unqualified, this row is the same claim the per-type
                  table used to make: that a vessel or aircraft node might
                  carry an address. Only persons and organizations declare
                  the attribute.
                -->
                <td class="p-4">Array of address objects (persons and organizations only)</td>
              </tr>
              <tr>
                <td class="p-4 font-mono text-sm">remarks</td>
                <td class="p-4">string</td>
                <td class="p-4">Additional remarks or notes</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>
