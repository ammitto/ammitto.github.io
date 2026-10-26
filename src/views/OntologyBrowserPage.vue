<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, nextTick, defineAsyncComponent } from 'vue'
import { useRoute, useRouter } from '@/utils/navigation'
import { useOntologyData, type HierarchyNode } from '@/composables/useOntologyData'
import CodeBlock from '@/components/molecules/CodeBlock.vue'
import { entityTypes } from '@/config'
import { inkToneVars, NEUTRAL_SEED } from '@/config/palette'

const {
  isLoaded,
  error,
  loadOntology,
  hierarchy,
  classes,
  properties,
  graphProperties,
  getClass,
  getPropertiesForClass,
  getSubclasses,
  loadExample,
} = useOntologyData()

// Keep the D3 graph out of the initial application/search bundle.
const OntologyGraph = defineAsyncComponent(() => import('@/components/organisms/OntologyGraph.vue'))

const graphClasses = computed(() => Array.from(classes.value.values()))

type OntologyTab = 'classes' | 'properties' | 'examples'
type ExampleType = 'person' | 'organization' | 'vessel'
const route = useRoute()
const router = useRouter()
const tabs: OntologyTab[] = ['classes', 'properties', 'examples']
const exampleTypes: ExampleType[] = ['person', 'organization', 'vessel']
const queryString = (key: string) => typeof route.query[key] === 'string' ? route.query[key] as string : ''
function updateQuery(values: Record<string, string | undefined>, replace = false) {
  const location = { query: { ...route.query, ...values }, hash: route.hash }
  void (replace ? router.replace(location) : router.push(location))
}
const selectedClass = computed(() => queryString('class') || 'Entity')
const expandedNodes = ref<Set<string>>(new Set(['Entity']))
const activeTab = computed<OntologyTab>(() => tabs.find(tab => tab === queryString('tab')) || 'classes')
const propertySearch = computed({
  get: () => queryString('property-search'),
  set: (value: string) => updateQuery({ 'property-search': value || undefined }, true),
})
const filteredProperties = computed(() => {
  const query = propertySearch.value.trim().toLocaleLowerCase()
  return [...properties.value].filter(([id, prop]) =>
    [id, prop.label, prop.comment, prop.domain, prop.range].some(value => value?.toLocaleLowerCase().includes(query)),
  )
})
const exampleData = ref<Record<string, unknown> | null>(null)
const exampleType = computed<ExampleType>(() => exampleTypes.find(type => type === queryString('example')) || 'person')
const exampleLoading = ref(false)
const exampleError = ref(false)
let exampleRequest = 0

function selectTab(tab: OntologyTab) {
  updateQuery({ tab: tab === 'classes' ? undefined : tab })
}

async function moveTab(event: KeyboardEvent, tab: OntologyTab) {
  const index = tabs.indexOf(tab)
  let next: OntologyTab | undefined
  if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length]
  if (event.key === 'ArrowLeft') next = tabs[(index + tabs.length - 1) % tabs.length]
  if (event.key === 'Home') next = tabs[0]
  if (event.key === 'End') next = tabs[tabs.length - 1]
  if (!next) return
  event.preventDefault()
  await router.push({ query: { ...route.query, tab: next === 'classes' ? undefined : next }, hash: route.hash })
  await nextTick()
  document.getElementById(`ontology-tab-${next}`)?.focus()
}

// Get selected class details
const selectedClassDetails = computed(() => {
  if (!selectedClass.value) return null
  return getClass(selectedClass.value)
})

// Get properties for selected class
const selectedClassProperties = computed(() => {
  if (!selectedClass.value) return []
  return getPropertiesForClass(selectedClass.value)
})

// Get subclasses for selected class
const selectedClassSubclasses = computed(() => {
  if (!selectedClass.value) return []
  return getSubclasses(selectedClass.value)
})

// Toggle node expansion
function toggleNode(nodeName: string) {
  if (expandedNodes.value.has(nodeName)) {
    expandedNodes.value.delete(nodeName)
  } else {
    expandedNodes.value.add(nodeName)
  }
}

// Select a class
async function selectClass(classId: string) {
  await router.push({ query: { ...route.query, class: classId, tab: undefined }, hash: route.hash })
  await nextTick()
  if (window.matchMedia('(max-width: 1023px)').matches) {
    const panel = document.getElementById('ontology-panel-classes')
    panel?.scrollIntoView({ block: 'start' })
    panel?.focus({ preventScroll: true })
  }
}

function selectExample(type: ExampleType) {
  updateQuery({ example: type, tab: 'examples' })
}

async function loadExampleData() {
  const request = ++exampleRequest
  exampleLoading.value = true
  exampleError.value = false
  exampleData.value = null
  const data = await loadExample(exampleType.value)
  if (request !== exampleRequest) return
  exampleData.value = data
  exampleError.value = data === null
  exampleLoading.value = false
}

watch([isLoaded, activeTab, exampleType], ([loaded, tab]) => {
  ++exampleRequest
  if (loaded && tab === 'examples') void loadExampleData()
}, { immediate: true })
onBeforeUnmount(() => { ++exampleRequest })

// Format JSON for display
function formatJson(data: Record<string, unknown> | null): string {
  if (!data) return ''
  return JSON.stringify(data, null, 2)
}

/**
 * Whether a class's instance count is worth printing.
 *
 * `api/v1/ontology/hierarchy.json` returns `count: 0` for every class — checked
 * live on 2026-08-28, on Entity and on each of its children — so the rail read
 * "Entity (0) / Person (0) / Organization (0)". A schema browser that reports
 * an empty graph, on a site whose front page says 61,099 entities, is worse
 * than one that reports nothing: the reader cannot tell "we did not measure
 * this" from "there is nothing here".
 *
 * When the producer starts emitting real counts these appear with no further
 * change here.
 */
function hasCount(node: HierarchyNode): boolean {
  return typeof node.count === 'number' && node.count > 0
}

/**
 * Seed colour for an entity type, taken from the shared config so the
 * hierarchy agrees with the badges elsewhere on the site. (This function used
 * to carry a second, conflicting hex map: person was blue here and amber in
 * `entityTypes`.) A node may also arrive from the ontology graph carrying its
 * own colour; either way the value is a seed, and `inkToneVars` derives the
 * per-theme text colour that is actually painted.
 */
function getTypeColor(type: string): string {
  return entityTypes.find(t => t.code === type)?.color ?? NEUTRAL_SEED
}

// Check if node is expanded
function isExpanded(nodeName: string): boolean {
  return expandedNodes.value.has(nodeName)
}

</script>

<template>
  <div class="ontology-browser min-h-screen bg-light-bg dark:bg-dark-bg">
    <div class="container-wide py-8">
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-light-text dark:text-dark-text">
          Ontology Browser
        </h1>
        <p class="mt-2 max-w-3xl text-light-muted dark:text-dark-muted">
          Explore the classes, properties, and relationships in the Ammitto data model.
        </p>
      </div>

    <!-- Loading state -->
    <!-- The server defers this request; only a recorded failure is an error. -->
    <div v-if="!isLoaded && !error" role="status" class="flex justify-center items-center gap-3 py-20">
      <div aria-hidden="true" class="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
      <span>Loading ontology…</span>
    </div>

    <!-- Main content -->
    <div v-else-if="isLoaded">
      <OntologyGraph
        :classes="graphClasses"
        :properties="graphProperties"
        :selected-class="selectedClass"
        @select="selectClass"
      />
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        <!-- Left panel: Class Hierarchy -->
        <div class="min-w-0 lg:col-span-1">
          <div class="bg-light-surface dark:bg-dark-surface rounded-lg shadow-xs p-4">
            <h2 class="text-lg font-semibold text-light-text dark:text-dark-text mb-4">
              Class Hierarchy
            </h2>

            <!--
              Two controls per row, side by side, and neither is a <div> with
              a click handler.

              Expanding a node and selecting it are separate actions, so they
              are separate native buttons: a keyboard reaches both by Tab and
              fires both with Enter or Space, and a screen reader announces
              each with its own name and state. Nesting is not an option in
              either direction — a <button> inside a <button> is invalid HTML
              and browsers reparent it — so the expander cannot live inside
              the selection control the way a search result card wraps its
              whole content in one RouterLink. That pattern holds only while
              nothing inside the card is itself interactive; here the expander
              is, which is precisely why this row is two siblings instead.

              The row container carries no handler at all. It used to: the
              selectable region was the outer <div>, which also contained the
              expanded subtree, so a click on a subclass ran its own handler
              and then bubbled into the parent's and overwrote the selection
              with the parent. Moving selection onto a button that wraps only
              the row's own label ends that by construction.
            -->
            <div class="space-y-1" v-if="hierarchy">
              <template v-for="child in hierarchy.children" :key="child.name">
                <div class="hierarchy-node">
                  <div
                    class="hierarchy-row flex items-center gap-2 p-2 rounded-sm hover:bg-light-bg dark:hover:bg-dark-border"
                    :class="{ 'bg-blue-50 dark:bg-blue-900/20': selectedClass === child.name }"
                  >
                    <!--
                      This was a <span> whose entire content was a bare
                      triangle glyph: not focusable, no role, and no name, so
                      expand/collapse was reachable with a mouse only and a
                      screen reader had nothing to announce but the shape. The
                      glyph is decorative once the button carries the name and
                      `aria-expanded` carries the state, so it is hidden from
                      assistive technology rather than read out.
                    -->
                    <button
                      v-if="child.children && child.children.length > 0"
                      type="button"
                      @click="toggleNode(child.name)"
                      :aria-expanded="isExpanded(child.name)"
                      :aria-label="`Subclasses of ${child.label}`"
                      class="text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text"
                    >
                      <span aria-hidden="true">{{ isExpanded(child.name) ? '▼' : '▶' }}</span>
                    </button>
                    <span v-else class="w-4"></span>

                    <button
                      type="button"
                      class="hierarchy-select flex flex-1 items-center gap-2 text-left"
                      :aria-current="selectedClass === child.name ? 'true' : undefined"
                      @click="selectClass(child.name)"
                    >
                      <!--
                        A dot, not the icon field. That field carries a Lucide
                        icon NAME — "database", "user", "building-2" — and this
                        rendered it as text, so the rail read "database Entity",
                        "user Person", "building-2 Authority" on the live site.
                        Nothing here can draw a Lucide glyph, so the honest
                        marker is the colour the data already supplies.
                      -->
                      <span
                        aria-hidden="true"
                        class="tone-ink bg-current inline-block w-2 h-2 rounded-full shrink-0"
                        :style="inkToneVars(child.color || getTypeColor(child.code || ''))"
                      />
                      <span class="hierarchy-label font-medium text-light-text dark:text-dark-text">{{ child.label }}</span>
                      <span v-if="hasCount(child)" class="text-xs text-light-muted dark:text-dark-muted">
                        ({{ child.count.toLocaleString() }})
                      </span>
                    </button>
                  </div>

                  <!-- Children -->
                  <div v-if="child.children && child.children.length > 0 && isExpanded(child.name)" class="ml-6 mt-1">
                    <div
                      v-for="subChild in child.children"
                      :key="subChild.name"
                      class="hierarchy-node"
                    >
                      <div
                        class="hierarchy-row flex items-center gap-2 p-2 rounded-sm hover:bg-light-bg dark:hover:bg-dark-border"
                        :class="{ 'bg-blue-50 dark:bg-blue-900/20': selectedClass === subChild.name }"
                      >
                        <button
                          type="button"
                          class="hierarchy-select flex flex-1 items-center gap-2 text-left"
                          :aria-current="selectedClass === subChild.name ? 'true' : undefined"
                          @click="selectClass(subChild.name)"
                        >
                          <!-- Same dot as the parent row; see the comment there. -->
                          <span
                            aria-hidden="true"
                            :style="inkToneVars(subChild.color || getTypeColor(subChild.code || ''))"
                            class="tone-ink bg-current inline-block w-2 h-2 rounded-full shrink-0"
                          />
                          <span class="hierarchy-label text-light-text dark:text-dark-text">{{ subChild.label }}</span>
                          <span v-if="hasCount(subChild)" class="text-xs text-light-muted dark:text-dark-muted">
                            ({{ subChild.count.toLocaleString() }})
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>

        <!-- Right panel: Details -->
        <div class="min-w-0 lg:col-span-2">
          <div class="bg-light-surface dark:bg-dark-surface rounded-lg shadow-xs">
            <!-- Tabs -->
            <div class="border-b border-light-border dark:border-dark-border">
              <nav class="flex -mb-px" role="tablist" aria-label="Ontology reference">
                <button
                  id="ontology-tab-classes" type="button" role="tab" aria-controls="ontology-panel-classes"
                  :aria-selected="activeTab === 'classes'" :tabindex="activeTab === 'classes' ? 0 : -1"
                  @click="selectTab('classes')" @keydown="moveTab($event, 'classes')"
                  :class="[
                    activeTab === 'classes'
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text',
                    'px-4 py-3 border-b-2 font-medium text-sm'
                  ]"
                >
                  Classes
                </button>
                <button
                  id="ontology-tab-properties" type="button" role="tab" aria-controls="ontology-panel-properties"
                  :aria-selected="activeTab === 'properties'" :tabindex="activeTab === 'properties' ? 0 : -1"
                  @click="selectTab('properties')" @keydown="moveTab($event, 'properties')"
                  :class="[
                    activeTab === 'properties'
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text',
                    'px-4 py-3 border-b-2 font-medium text-sm'
                  ]"
                >
                  Properties
                </button>
                <button
                  id="ontology-tab-examples" type="button" role="tab" aria-controls="ontology-panel-examples"
                  :aria-selected="activeTab === 'examples'" :tabindex="activeTab === 'examples' ? 0 : -1"
                  @click="selectTab('examples')" @keydown="moveTab($event, 'examples')"
                  :class="[
                    activeTab === 'examples'
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text',
                    'px-4 py-3 border-b-2 font-medium text-sm'
                  ]"
                >
                  Examples
                </button>
              </nav>
            </div>

            <!-- Class details -->
            <div v-show="activeTab === 'classes'" id="ontology-panel-classes" role="tabpanel" aria-labelledby="ontology-tab-classes" tabindex="0" class="p-4 sm:p-6">
              <template v-if="selectedClassDetails">
              <h3 class="text-xl font-bold text-light-text dark:text-dark-text mb-4">
                {{ selectedClassDetails.label }}
              </h3>
              <p class="text-light-muted dark:text-dark-muted mb-6">
                {{ selectedClassDetails.comment }}
              </p>

              <!-- Parent class -->
              <div v-if="selectedClassDetails.subClassOf" class="mb-4">
                <span class="text-sm font-medium text-light-muted dark:text-dark-muted">Subclass of:</span>
                <button
                  @click="selectClass(selectedClassDetails.subClassOf?.split('/').pop() || '')"
                  class="ml-2 text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {{ selectedClassDetails.subClassOf.split('/').pop() }}
                </button>
              </div>

              <!-- Properties -->
              <div v-if="selectedClassProperties.length > 0" class="mb-6">
                <h4 class="text-sm font-semibold text-light-text dark:text-dark-text mb-2">
                  Properties
                </h4>
                <div class="space-y-2">
                  <div
                    v-for="prop in selectedClassProperties"
                    :key="prop['@id']"
                    class="flex items-center gap-2 p-2 bg-light-bg dark:bg-dark-bg rounded-sm"
                  >
                    <span class="font-medium text-light-text dark:text-dark-text">
                      {{ prop.label }}
                    </span>
                    <span class="text-xs text-light-muted dark:text-dark-muted">
                      ({{ prop.range?.split('/').pop() || prop.range }})
                    </span>
                    <span v-if="prop.isArray" class="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-1 rounded-sm">
                      array
                    </span>
                  </div>
                </div>
              </div>

              <!-- Subclasses -->
              <div v-if="selectedClassSubclasses.length > 0">
                <h4 class="text-sm font-semibold text-light-text dark:text-dark-text mb-2">
                  Subclasses
                </h4>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="sub in selectedClassSubclasses"
                    :key="sub['@id']"
                    @click="selectClass(sub['@id'].split('/').pop() || '')"
                    class="px-3 py-1 bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text rounded-full hover:bg-light-border dark:hover:bg-dark-border"
                  >
                    {{ sub.label }}
                  </button>
                </div>
              </div>
              </template>
              <p v-else class="text-light-muted dark:text-dark-muted">Select a class from the hierarchy to view its definition and properties.</p>
            </div>

            <!-- Properties list -->
            <div v-show="activeTab === 'properties'" id="ontology-panel-properties" role="tabpanel" aria-labelledby="ontology-tab-properties" tabindex="0" class="p-4 sm:p-6">
              <div class="mb-4">
                <label for="ontology-property-search" class="block mb-2 font-medium text-light-text dark:text-dark-text">Search properties</label>
                <input
                  id="ontology-property-search" v-model="propertySearch" type="search"
                  placeholder="Name, description, domain, or range"
                  class="w-full px-4 py-2 border border-light-border dark:border-dark-border rounded-lg bg-light-surface dark:bg-dark-surface text-light-text dark:text-dark-text"
                />
                <p role="status" class="mt-2 text-sm text-light-muted dark:text-dark-muted">{{ filteredProperties.length }} of {{ properties.size }} properties</p>
              </div>
              <p v-if="filteredProperties.length === 0" class="py-6 text-light-muted dark:text-dark-muted">No properties match “{{ propertySearch }}”. Try a different name or clear the search.</p>
              <div class="space-y-3">
                <article
                  v-for="[id, prop] in filteredProperties"
                  :key="id"
                  class="p-4 border border-light-border dark:border-dark-border rounded-lg break-words"
                >
                  <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <h3 class="font-semibold text-light-text dark:text-dark-text">{{ prop.label }}</h3>
                    <code class="text-xs text-light-muted dark:text-dark-muted">{{ id }}</code>
                  </div>
                  <p class="text-sm text-light-muted dark:text-dark-muted mt-1">{{ prop.comment }}</p>
                  <div class="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-sm">
                    <span v-if="prop.domain" class="text-light-muted dark:text-dark-muted">
                      Domain: <span class="font-medium text-light-text dark:text-dark-text">{{ prop.domain.split('/').pop() }}</span>
                    </span>
                    <span v-if="prop.range" class="text-light-muted dark:text-dark-muted">
                      Range: <span class="font-medium text-light-text dark:text-dark-text">{{ prop.range.split(/[\/#]/).pop() }}</span>
                    </span>
                  </div>
                </article>
              </div>
            </div>

            <!-- Examples -->
            <div v-show="activeTab === 'examples'" id="ontology-panel-examples" role="tabpanel" aria-labelledby="ontology-tab-examples" tabindex="0" class="p-4 sm:p-6">
              <p class="mb-4 text-light-muted dark:text-dark-muted">Example JSON-LD records for the selected entity type.</p>
              <div class="mb-4 flex flex-wrap gap-2" role="group" aria-label="Example entity type">
                <button
                  type="button" :aria-pressed="exampleType === 'person'" @click="selectExample('person')"
                  :class="[
                    exampleType === 'person'
                      ? 'bg-blue-600 text-white'
                      : 'bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text',
                    'px-4 py-2 rounded-lg font-medium'
                  ]"
                >
                  Person
                </button>
                <button
                  type="button" :aria-pressed="exampleType === 'organization'" @click="selectExample('organization')"
                  :class="[
                    exampleType === 'organization'
                      ? 'bg-blue-600 text-white'
                      : 'bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text',
                    'px-4 py-2 rounded-lg font-medium'
                  ]"
                >
                  Organization
                </button>
                <button
                  type="button" :aria-pressed="exampleType === 'vessel'" @click="selectExample('vessel')"
                  :class="[
                    exampleType === 'vessel'
                      ? 'bg-blue-600 text-white'
                      : 'bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text',
                    'px-4 py-2 rounded-lg font-medium'
                  ]"
                >
                  Vessel
                </button>
              </div>

              <p v-if="exampleLoading" role="status" class="py-6 text-light-muted dark:text-dark-muted">Loading {{ exampleType }} example…</p>
              <div v-else-if="exampleError" role="alert" class="py-4">
                <p class="mb-3">The {{ exampleType }} example could not be loaded.</p>
                <button type="button" class="btn-secondary" @click="loadExampleData">Retry example</button>
              </div>
              <div v-else-if="exampleData">
                <CodeBlock
                  :code="formatJson(exampleData)"
                  language="json"
                  :title="`${exampleType[0]?.toUpperCase()}${exampleType.slice(1)} JSON-LD example`"
                />
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="py-8 text-center">
      <p role="alert" class="mb-4">Ontology data could not be loaded.</p>
      <button type="button" class="btn-secondary" @click="loadOntology">Retry ontology</button>
    </div>
    </div>
  </div>
</template>

<style scoped>
/* The row, not the node: the node wraps the expanded subtree as well, and a
   highlight that covered it would report the parent's selection over every
   child. */
.hierarchy-row {
  transition: background-color 0.15s ease;
}
[role="tabpanel"] { scroll-margin-top: 1rem; }
@media (prefers-reduced-motion: reduce) {
  .hierarchy-row { transition: none; }
}
</style>
