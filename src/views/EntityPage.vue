<script setup lang="ts">
import { onMounted, computed, watch, reactive } from 'vue'
import { useRoute } from 'vue-router'
import Badge from '@/components/atoms/Badge.vue'
import { useEntityData } from '@/composables/useEntityData'
import { sources, entityTypes } from '@/config'

const route = useRoute()
const {
  entity,
  entityLoading,
  entityError,
  loadEntity,
  source,
  sourceReference,
  entityType,
  remarks,
  addresses,
  effects,
  reasons,
  effectiveDate,
  entryStatus,
  listTypes,
  regimes,
  announcements,
  groupIds,
  nationalities,
  identificationTable,
  position,
  birthInfo,
  entries,
} = useEntityData()

// Cache for document types and organizations (using reactive for better reactivity)
const documentTypes = reactive<Record<string, { identifier: string; name: Array<{ value: string; lang: string }> }>>({})
const organizations = reactive<Record<string, { identifier: string; name: Array<{ value: string; lang: string }> }>>({})

// Load document types and organizations when entries are loaded
const loadRelatedData = async () => {
  if (entries.value.length === 0) {
    console.log('No entries to load related data from')
    return
  }

  const docTypeIds = new Set<string>()
  const orgIds = new Set<string>()

  for (const entry of entries.value) {
    console.log('Entry announcement:', entry.announcement)
    if (entry.announcement?.document_type) {
      docTypeIds.add(entry.announcement.document_type)
    }
    if (entry.announcement?.authority) {
      orgIds.add(entry.announcement.authority)
    }
    if (entry.announcement?.signatory) {
      orgIds.add(entry.announcement.signatory)
    }
    if (entry.announcement?.publisher) {
      orgIds.add(entry.announcement.publisher)
    }
  }

  console.log('Document type IDs:', [...docTypeIds])
  console.log('Organization IDs:', [...orgIds])

  // Fetch document types
  for (const id of docTypeIds) {
    if (!documentTypes[id]) {
      try {
        const url = `/api/v1/node/document-type/${id}.jsonld`
        console.log('Fetching document type:', url)
        const response = await fetch(url)
        if (response.ok) {
          const data = await response.json()
          console.log('Got document type data:', data)
          documentTypes[id] = data
        } else {
          console.log('Failed to fetch document type:', response.status)
        }
      } catch (e) {
        console.error('Error fetching document type:', e)
      }
    }
  }

  // Fetch organizations
  for (const id of orgIds) {
    if (!organizations[id]) {
      try {
        const url = `/api/v1/node/organization/${id}.jsonld`
        console.log('Fetching organization:', url)
        const response = await fetch(url)
        if (response.ok) {
          const data = await response.json()
          console.log('Got organization data:', data)
          organizations[id] = data
        } else {
          console.log('Failed to fetch organization:', response.status)
        }
      } catch (e) {
        console.error('Error fetching organization:', e)
      }
    }
  }
}

// Get display name for document type
const getDocumentTypeName = (id: string): string => {
  const docType = documentTypes[id]
  if (!docType?.name) return id
  const enName = docType.name.find((n: { value: string; lang: string }) => n.lang === 'en')
  const zhName = docType.name.find((n: { value: string; lang: string }) => n.lang === 'zh')
  return enName?.value || zhName?.value || id
}

// Get display name for organization
const getOrganizationName = (id: string): string => {
  const org = organizations[id]
  if (!org?.name) return id
  const enName = org.name.find((n: { value: string; lang: string }) => n.lang === 'en')
  const zhName = org.name.find((n: { value: string; lang: string }) => n.lang === 'zh')
  return enName?.value || zhName?.value || id
}

const entityId = computed(() => route.params.id as string)

// Watch for route changes
watch(entityId, (newId) => {
  if (newId) {
    loadEntity(newId)
  }
}, { immediate: false })

const sourceInfo = computed(() => {
  if (!source.value) return null
  return sources.find(s => s.code === source.value)
})

const typeInfo = computed(() => {
  if (!entityType.value) return null
  return entityTypes.find(t => t.code === entityType.value)
})

// Format effect type for display
const formatEffectType = (effectType?: string): string => {
  if (!effectType) return ''
  return effectType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

// Extract ID from IRI (e.g., "https://www.ammitto.org/group/cn/202510" -> "cn/202510")
const extractIdFromIri = (iri: string): string => {
  const parts = iri.split('/')
  // Return last two parts (source/id)
  return parts.slice(-2).join('/')
}

// Get script display name
const getScriptName = (script?: string): string => {
  const scriptNames: Record<string, string> = {
    'Latn': 'Latin',
    'Cyrl': 'Cyrillic',
    'Arab': 'Arabic',
    'Hans': 'Simplified Chinese',
    'Hant': 'Traditional Chinese',
    'Hani': 'Han characters',
    'Kore': 'Korean',
    'Jpan': 'Japanese',
    'Thai': 'Thai',
    'Deva': 'Devanagari',
    'Hebr': 'Hebrew',
    'Grek': 'Greek',
    'Beng': 'Bengali',
    'Taml': 'Tamil',
    'Guru': 'Gurmukhi',
    'Gujr': 'Gujarati',
  }
  return script ? (scriptNames[script] || script) : 'Unknown'
}

// Organize names by script
const namesByScript = computed(() => {
  if (!entity.value?.names) return []

  const grouped: Record<string, { script: string; scriptName: string; names: Array<{ fullName: string; isPrimary: boolean }> }> = {}

  for (const name of entity.value.names) {
    const script = name.script || 'Unknown'
    if (!grouped[script]) {
      grouped[script] = {
        script,
        scriptName: getScriptName(script),
        names: []
      }
    }
    grouped[script].names.push({
      fullName: name.full_name,
      isPrimary: name.is_primary
    })
  }

  // Sort: primary script first, then alphabetically
  return Object.values(grouped).sort((a, b) => {
    const aHasPrimary = a.names.some(n => n.isPrimary)
    const bHasPrimary = b.names.some(n => n.isPrimary)
    if (aHasPrimary && !bHasPrimary) return -1
    if (!aHasPrimary && bHasPrimary) return 1
    return a.scriptName.localeCompare(b.scriptName)
  })
})

onMounted(async () => {
  await loadEntity(entityId.value)
  // Load related data after entity is loaded
  await loadRelatedData()
})
</script>

<template>
  <div class="min-h-screen">
    <div class="container-wide py-8">
      <RouterLink
        to="/search"
        class="inline-flex items-center gap-2 text-light-muted dark:text-dark-muted hover:text-brand-primary mb-6"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Search
      </RouterLink>

      <div v-if="entityLoading" class="glass-card p-8 text-center">
        <div class="w-8 h-8 border-2 border-brand-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p class="mt-4 text-light-muted dark:text-dark-muted">Loading entity...</p>
      </div>

      <div v-else-if="entityError" class="glass-card p-8 text-center">
        <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-status-delisted/20 flex items-center justify-center">
          <svg class="w-8 h-8 text-status-delisted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 class="font-semibold text-lg mb-2">Entity Not Found</h3>
        <p class="text-light-muted dark:text-dark-muted">{{ entityError }}</p>
      </div>

      <article v-else-if="entity" class="space-y-6">
        <!-- Header -->
        <div class="glass-card p-8">
          <div class="flex flex-wrap items-center gap-3 mb-4">
            <Badge :variant="entityType as any">
              {{ typeInfo?.icon }} {{ typeInfo?.name }}
            </Badge>
            <Badge variant="source" :source-code="source ?? undefined">
              {{ sourceInfo?.name }}
            </Badge>
            <Badge :variant="(entryStatus || 'active') as any">
              {{ entryStatus || 'Active' }}
            </Badge>
          </div>

          <!-- Primary Name -->
          <h1 class="text-3xl font-bold text-light-text dark:text-dark-text mb-2">
            {{ entity.names?.find(n => n.is_primary)?.full_name || entity.names?.[0]?.full_name || 'Unknown' }}
          </h1>

          <!-- Entity ID -->
          <p class="text-light-muted dark:text-dark-muted font-mono text-sm break-all">
            {{ entity.id }}
          </p>
        </div>

        <!-- Names by Script -->
        <div v-if="namesByScript.length > 0" class="glass-card p-8">
          <h2 class="text-xl font-semibold mb-4 text-light-text dark:text-dark-text">
            Names
          </h2>
          <div class="space-y-4">
            <div v-for="group in namesByScript" :key="group.script" class="border-l-2 border-brand-primary/30 pl-4">
              <h3 class="text-sm font-medium text-brand-primary mb-2">
                {{ group.scriptName }}
                <span class="text-light-muted dark:text-dark-muted font-normal">
                  ({{ group.names.length }} {{ group.names.length === 1 ? 'name' : 'names' }})
                </span>
              </h3>
              <ul class="space-y-1">
                <li
                  v-for="name in group.names"
                  :key="name.fullName"
                  class="text-light-text dark:text-dark-text"
                >
                  <span v-if="name.isPrimary" class="font-semibold">{{ name.fullName }}</span>
                  <span v-else class="text-light-muted dark:text-dark-muted">{{ name.fullName }}</span>
                  <Badge v-if="name.isPrimary" variant="active" class="ml-2 text-xs">Primary</Badge>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Basic Details -->
        <div class="glass-card p-8">
          <h2 class="text-xl font-semibold mb-4 text-light-text dark:text-dark-text">
            Details
          </h2>
          <dl class="grid sm:grid-cols-2 gap-4">
            <div v-if="entity.entity_type">
              <dt class="text-sm text-light-muted dark:text-dark-muted">Entity Type</dt>
              <dd class="font-medium text-light-text dark:text-dark-text capitalize">{{ entity.entity_type }}</dd>
            </div>
            <!--
              Every claim the sources made, not just the first. Where they
              disagree, the disagreement is the information: a reader
              screening a subject needs to see that one list says 1957 and
              another says 1958.
            -->
            <!--
              No "(stated)" qualifier on the multi-line case. Several
              records do not reliably mean several claims: sources also
              split one address across records, and repeat one date under
              two transliterations of the same city. Labelling those as
              stated variants would assert a disagreement the source did
              not make.
            -->
            <div v-if="birthInfo.length">
              <dt class="text-sm text-light-muted dark:text-dark-muted">
                Birth Information
              </dt>
              <dd
                v-for="claim in birthInfo"
                :key="claim"
                class="font-medium text-light-text dark:text-dark-text"
              >{{ claim }}</dd>
            </div>
            <div v-if="sourceReference">
              <dt class="text-sm text-light-muted dark:text-dark-muted">Reference Number</dt>
              <dd class="font-medium text-light-text dark:text-dark-text font-mono">{{ sourceReference }}</dd>
            </div>
            <div v-if="sourceInfo">
              <dt class="text-sm text-light-muted dark:text-dark-muted">Source</dt>
              <dd class="font-medium text-light-text dark:text-dark-text">{{ sourceInfo.fullName }}</dd>
            </div>
          </dl>
        </div>

        <!-- Sanctions Information (from entries) -->
        <div v-if="effects.length > 0 || effectiveDate || listTypes.length > 0 || regimes.length > 0" class="glass-card p-8">
          <h2 class="text-xl font-semibold mb-4 text-light-text dark:text-dark-text">
            Sanctions Information
          </h2>
          <dl class="grid sm:grid-cols-2 gap-4">
            <div v-if="effectiveDate">
              <dt class="text-sm text-light-muted dark:text-dark-muted">Effective Date</dt>
              <dd class="font-medium text-light-text dark:text-dark-text">{{ effectiveDate }}</dd>
            </div>
            <div v-if="entryStatus">
              <dt class="text-sm text-light-muted dark:text-dark-muted">Status</dt>
              <dd class="font-medium text-light-text dark:text-dark-text capitalize">{{ entryStatus }}</dd>
            </div>
            <div v-if="listTypes.length > 0" class="sm:col-span-2">
              <dt class="text-sm text-light-muted dark:text-dark-muted mb-2">List Types</dt>
              <dd class="flex flex-wrap gap-2">
                <Badge v-for="lt in listTypes" :key="lt" variant="default">{{ lt }}</Badge>
              </dd>
            </div>
            <div v-if="regimes.length > 0" class="sm:col-span-2">
              <dt class="text-sm text-light-muted dark:text-dark-muted mb-2">Sanctions Regimes</dt>
              <dd class="flex flex-wrap gap-2">
                <Badge v-for="regime in regimes" :key="regime" variant="source">{{ regime }}</Badge>
              </dd>
            </div>
            <div v-if="effects.length > 0" class="sm:col-span-2">
              <dt class="text-sm text-light-muted dark:text-dark-muted mb-2">Measures / Effects</dt>
              <dd>
                <ul class="space-y-3 text-light-text dark:text-dark-text">
                  <li v-for="(effect, idx) in effects" :key="idx" class="border-l-2 border-brand-primary/30 pl-3">
                    <div class="flex items-center gap-2 mb-1">
                      <span class="capitalize font-medium text-sm">{{ formatEffectType(effect.effect_type) }}</span>
                    </div>
                    <!-- Localized descriptions -->
                    <!-- Localized array only: a plain-string description would
                         truthy-match here and v-for would iterate its
                         CHARACTERS, rendering one bare colon per character
                         (seen live on every wb debarment record). -->
                    <div v-if="Array.isArray(effect.description) && effect.description.length > 0" class="space-y-1">
                      <div v-for="(desc, didx) in effect.description" :key="didx" class="text-sm">
                        <span class="text-light-muted dark:text-dark-muted text-xs uppercase mr-1">{{ desc.lang }}:</span>
                        <span :class="{ 'font-medium': desc.is_primary }">{{ desc.value }}</span>
                      </div>
                    </div>
                    <!-- Fallback for simple description string -->
                    <div v-else-if="effect.description" class="text-sm">
                      {{ effect.description }}
                    </div>
                  </li>
                </ul>
              </dd>
            </div>
          </dl>
        </div>

        <!-- Reasons (from entries) -->
        <div v-if="reasons.length > 0" class="glass-card p-8">
          <h2 class="text-xl font-semibold mb-4 text-light-text dark:text-dark-text">
            Sanction Reasons
          </h2>
          <ul class="space-y-3 text-light-text dark:text-dark-text">
            <li v-for="(reason, idx) in reasons" :key="idx" class="border-l-2 border-brand-primary/30 pl-3">
              <div v-if="reason.category" class="text-xs uppercase text-brand-primary mb-1">
                {{ reason.category }}
              </div>
              <!-- Same guard as effects: v-for over a plain string iterates
                   characters and renders a colon per character. -->
              <div v-if="Array.isArray(reason.description) && reason.description.length > 0" class="space-y-1">
                <div v-for="(desc, didx) in reason.description" :key="didx" class="text-sm">
                  <span class="text-light-muted dark:text-dark-muted text-xs uppercase mr-1">{{ desc.lang }}:</span>
                  <span :class="{ 'font-medium': desc.is_primary }">{{ desc.value }}</span>
                </div>
              </div>
              <div v-else-if="reason.description" class="text-sm">
                {{ reason.description }}
              </div>
            </li>
          </ul>
        </div>

        <!-- Connections (Group, Announcement links) -->
        <div v-if="groupIds.length > 0 || entries.length > 0" class="glass-card p-8">
          <h2 class="text-xl font-semibold mb-4 text-light-text dark:text-dark-text">
            Connections
          </h2>
          <dl class="space-y-4">
            <div v-if="groupIds.length > 0">
              <dt class="text-sm text-light-muted dark:text-dark-muted mb-2">Sanction Groups</dt>
              <dd class="space-y-1">
                <RouterLink
                  v-for="groupId in groupIds"
                  :key="groupId"
                  :to="`/group/${extractIdFromIri(groupId)}`"
                  class="block text-brand-primary hover:text-brand-primary/80 font-mono text-sm"
                >
                  {{ groupId }}
                </RouterLink>
              </dd>
            </div>
            <div v-if="entries.length > 0">
              <dt class="text-sm text-light-muted dark:text-dark-muted mb-2">Entry IDs</dt>
              <dd class="font-mono text-xs text-light-muted dark:text-dark-muted break-all">
                <div v-for="entry in entries" :key="entry.id" class="mb-1">
                  {{ entry.id }}
                </div>
              </dd>
            </div>
          </dl>
        </div>

        <!-- Announcements (from entries) -->
        <div v-if="announcements.length > 0" class="glass-card p-8">
          <h2 class="text-xl font-semibold mb-4 text-light-text dark:text-dark-text">
            Official Announcements
          </h2>
          <div class="space-y-6">
            <div v-for="(announcement, idx) in announcements" :key="idx" class="border-l-2 border-brand-primary/30 pl-4">
              <h3 v-if="announcement.title" class="font-medium text-light-text dark:text-dark-text mb-2">
                {{ announcement.title }}
              </h3>
              <dl class="text-sm space-y-2">
                <div v-if="announcement.document_id">
                  <dt class="text-light-muted dark:text-dark-muted inline">Document ID: </dt>
                  <dd class="text-light-text dark:text-dark-text inline">{{ announcement.document_id }}</dd>
                </div>
                <div v-if="announcement.document_type">
                  <dt class="text-light-muted dark:text-dark-muted inline">Type: </dt>
                  <dd class="inline">
                    <RouterLink
                      :to="`/document-type/${announcement.document_type}`"
                      class="text-brand-primary hover:text-brand-primary/80"
                    >
                      {{ getDocumentTypeName(announcement.document_type) }}
                    </RouterLink>
                  </dd>
                </div>
                <div v-if="announcement.publish_date">
                  <dt class="text-light-muted dark:text-dark-muted inline">Published: </dt>
                  <dd class="text-light-text dark:text-dark-text inline">{{ announcement.publish_date }}</dd>
                </div>
                <div v-if="announcement.authority">
                  <dt class="text-light-muted dark:text-dark-muted inline">Authority: </dt>
                  <dd class="inline">
                    <RouterLink
                      :to="`/organization/${announcement.authority}`"
                      class="text-brand-primary hover:text-brand-primary/80"
                    >
                      {{ getOrganizationName(announcement.authority) }}
                    </RouterLink>
                  </dd>
                </div>
                <div v-if="announcement.signatory && announcement.signatory !== announcement.authority">
                  <dt class="text-light-muted dark:text-dark-muted inline">Signatory: </dt>
                  <dd class="inline">
                    <RouterLink
                      :to="`/organization/${announcement.signatory}`"
                      class="text-brand-primary hover:text-brand-primary/80"
                    >
                      {{ getOrganizationName(announcement.signatory) }}
                    </RouterLink>
                  </dd>
                </div>
                <div v-if="announcement.publisher && announcement.publisher !== announcement.authority && announcement.publisher !== announcement.signatory">
                  <dt class="text-light-muted dark:text-dark-muted inline">Publisher: </dt>
                  <dd class="inline">
                    <RouterLink
                      :to="`/organization/${announcement.publisher}`"
                      class="text-brand-primary hover:text-brand-primary/80"
                    >
                      {{ getOrganizationName(announcement.publisher) }}
                    </RouterLink>
                  </dd>
                </div>
              </dl>
              <div class="flex flex-wrap gap-4 mt-3">
                <RouterLink
                  v-if="groupIds.length > 0"
                  :to="`/announcement/${extractIdFromIri(groupIds[0])}`"
                  class="inline-flex items-center gap-1 text-brand-primary hover:text-brand-primary/80 text-sm"
                >
                  View Full Announcement & All Entities
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </RouterLink>
                <a
                  v-if="announcement.url"
                  :href="announcement.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1 text-brand-primary hover:text-brand-primary/80 text-sm"
                >
                  View Official Source
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
              <details v-if="announcement.content" class="mt-3">
                <summary class="cursor-pointer text-sm text-brand-primary hover:text-brand-primary/80">
                  View Full Text
                </summary>
                <p class="mt-2 text-sm text-light-muted dark:text-dark-muted whitespace-pre-wrap bg-light-surface/50 dark:bg-dark-surface/50 p-3 rounded-lg">{{ announcement.content }}</p>
              </details>
            </div>
          </div>
        </div>

        <!-- Nationalities -->
        <div v-if="nationalities.length > 0" class="glass-card p-8">
          <h2 class="text-xl font-semibold mb-4 text-light-text dark:text-dark-text">
            Nationality
          </h2>
          <div class="flex flex-wrap gap-2">
            <Badge v-for="nat in nationalities" :key="nat" variant="default">{{ nat }}</Badge>
          </div>
        </div>

        <!-- Position -->
        <div v-if="position" class="glass-card p-8">
          <h2 class="text-xl font-semibold mb-4 text-light-text dark:text-dark-text">
            Position / Title
          </h2>
          <p class="text-light-muted dark:text-dark-muted">{{ position }}</p>
        </div>

        <!-- Identifications -->
        <!--
          Type and number are the document; the issuing country earns a
          column only when some record on this entity states one, so an
          entity whose source publishes none is not given a column of
          dashes to read past. A note is prose — often the whole content of
          a record that has no number — so it runs full width beneath its
          row instead of being squeezed into a fourth column that most
          records would leave empty.
        -->
        <div v-if="identificationTable.rows.length > 0" class="glass-card p-8">
          <h2 class="text-xl font-semibold mb-4 text-light-text dark:text-dark-text">
            Identifications
          </h2>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-light-border dark:border-dark-border">
                  <th class="text-left py-2 text-light-muted dark:text-dark-muted font-medium">Type</th>
                  <th class="text-left py-2 text-light-muted dark:text-dark-muted font-medium">Number</th>
                  <th
                    v-if="identificationTable.hasIssuingCountry"
                    class="text-left py-2 text-light-muted dark:text-dark-muted font-medium"
                  >
                    Issuing Country
                  </th>
                </tr>
              </thead>
              <tbody>
                <template v-for="(row, idx) in identificationTable.rows" :key="idx">
                  <tr :class="{ 'border-b border-light-border/50 dark:border-dark-border/50': !row.note }">
                    <td class="py-2 pr-4 text-light-text dark:text-dark-text">{{ row.type || '—' }}</td>
                    <td class="py-2 pr-4 text-light-text dark:text-dark-text font-mono break-all">{{ row.number || '—' }}</td>
                    <td
                      v-if="identificationTable.hasIssuingCountry"
                      class="py-2 text-light-text dark:text-dark-text"
                    >
                      {{ row.issuingCountry || '—' }}
                    </td>
                  </tr>
                  <tr v-if="row.note" class="border-b border-light-border/50 dark:border-dark-border/50">
                    <td
                      :colspan="identificationTable.hasIssuingCountry ? 3 : 2"
                      class="pb-2 text-light-muted dark:text-dark-muted"
                    >
                      {{ row.note }}
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Addresses -->
        <div v-if="addresses && addresses.length > 0" class="glass-card p-8">
          <h2 class="text-xl font-semibold mb-4 text-light-text dark:text-dark-text">
            Addresses
          </h2>
          <div class="space-y-4">
            <div
              v-for="(addr, idx) in addresses"
              :key="idx"
              class="p-4 bg-light-surface/50 dark:bg-dark-surface/50 rounded-lg"
            >
              <p class="text-light-text dark:text-dark-text">
                <template v-if="addr.street">{{ addr.street }}<br /></template>
                <template v-if="addr.city">{{ addr.city }}</template>
                <template v-if="addr.state">{{ addr.state }}</template>
                <template v-if="addr.city || addr.state"><br /></template>
                <template v-if="addr.country">{{ addr.country }}</template>
                <template v-if="addr.postal_code"> {{ addr.postal_code }}</template>
              </p>
            </div>
          </div>
        </div>

        <!-- Remarks -->
        <div v-if="remarks" class="glass-card p-8">
          <h2 class="text-xl font-semibold mb-4 text-light-text dark:text-dark-text">
            Remarks
          </h2>
          <p class="text-light-muted dark:text-dark-muted whitespace-pre-wrap">{{ remarks }}</p>
        </div>

        <!-- Raw Data (for debugging/transparency) -->
        <details class="glass-card p-8">
          <summary class="cursor-pointer text-sm text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text">
            View Raw Data
          </summary>
          <div class="mt-4 space-y-4">
            <div>
              <h4 class="text-xs uppercase text-light-muted dark:text-dark-muted mb-2">Entity</h4>
              <pre class="text-xs overflow-x-auto text-light-muted dark:text-dark-muted bg-light-surface/50 dark:bg-dark-surface/50 p-4 rounded-lg">{{ JSON.stringify(entity, null, 2) }}</pre>
            </div>
            <div v-if="entries.length > 0">
              <h4 class="text-xs uppercase text-light-muted dark:text-dark-muted mb-2">Entries ({{ entries.length }})</h4>
              <pre class="text-xs overflow-x-auto text-light-muted dark:text-dark-muted bg-light-surface/50 dark:bg-dark-surface/50 p-4 rounded-lg">{{ JSON.stringify(entries, null, 2) }}</pre>
            </div>
          </div>
        </details>
      </article>
    </div>
  </div>
</template>
