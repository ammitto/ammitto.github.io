<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useOntologyData, type HierarchyNode } from '@/composables/useOntologyData'
import CodeBlock from '@/components/molecules/CodeBlock.vue'
import { entityTypes } from '@/config'
import { inkToneVars, NEUTRAL_SEED } from '@/config/palette'

const {
  isLoading,
  isLoaded,
  hierarchy,
  properties,
  getClass,
  getPropertiesForClass,
  getSubclasses,
  loadExample,
} = useOntologyData()

// Selected item for detail view
const selectedClass = ref<string | null>(null)
const selectedProperty = ref<string | null>(null)
const expandedNodes = ref<Set<string>>(new Set(['Entity']))
const activeTab = ref<'classes' | 'properties' | 'examples'>('classes')
const exampleData = ref<Record<string, unknown> | null>(null)
const exampleType = ref<'person' | 'organization' | 'vessel'>('person')

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
function selectClass(classId: string) {
  selectedClass.value = classId
  selectedProperty.value = null
  activeTab.value = 'classes'
}

// Load example
async function loadExampleData(type: 'person' | 'organization' | 'vessel') {
  exampleType.value = type
  exampleData.value = await loadExample(type)
  activeTab.value = 'examples'
}

// Format JSON for display
function formatJson(data: Record<string, unknown> | null): string {
  if (!data) return ''
  return JSON.stringify(data, null, 2)
}

// Get icon for node
function getNodeIcon(node: HierarchyNode): string {
  if (node.icon) return node.icon
  if (node.name.includes('Entity')) return 'database'
  if (node.name.includes('Entry')) return 'file-text'
  return 'folder'
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

// Load example on mount if needed
onMounted(async () => {
  if (isLoaded.value) {
    exampleData.value = await loadExample('person')
  }
})
</script>

<template>
  <div class="ontology-browser min-h-screen bg-light-bg dark:bg-dark-bg">
    <!-- Header -->
    <header class="bg-light-surface dark:bg-dark-surface shadow-sm">
      <div class="max-w-7xl mx-auto px-4 py-6">
        <h1 class="text-3xl font-bold text-light-text dark:text-dark-text">
          Ontology Browser
        </h1>
        <p class="mt-2 text-light-muted dark:text-dark-muted">
          Explore the Ammitto knowledge graph schema - classes, properties, and relationships
        </p>
      </div>
    </header>

    <!-- Loading state -->
    <div v-if="isLoading" class="flex justify-center items-center py-20">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>

    <!-- Main content -->
    <div v-else-if="isLoaded" class="max-w-7xl mx-auto px-4 py-8">
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <!-- Left panel: Class Hierarchy -->
        <div class="lg:col-span-1">
          <div class="bg-light-surface dark:bg-dark-surface rounded-lg shadow-sm p-4">
            <h2 class="text-lg font-semibold text-light-text dark:text-dark-text mb-4">
              Class Hierarchy
            </h2>

            <!-- Hierarchy tree -->
            <div class="space-y-1" v-if="hierarchy">
              <template v-for="child in hierarchy.children" :key="child.name">
                <div
                  class="hierarchy-node cursor-pointer p-2 rounded hover:bg-light-bg dark:hover:bg-dark-border"
                  :class="{ 'bg-blue-50 dark:bg-blue-900/20': selectedClass === child.name }"
                  @click="selectClass(child.name)"
                >
                  <div class="flex items-center gap-2">
                    <!--
                      A control, so it is built from a button. This was a
                      <span> whose entire content was a bare triangle glyph:
                      not focusable, no role, and no name — the expand/collapse
                      of the class hierarchy was reachable with a mouse only,
                      and a screen reader had nothing to announce but the
                      shape. The glyph is decorative once the button carries
                      the name and `aria-expanded` carries the state, so it is
                      hidden from assistive technology rather than read out.
                    -->
                    <button
                      v-if="child.children && child.children.length > 0"
                      type="button"
                      @click.stop="toggleNode(child.name)"
                      :aria-expanded="isExpanded(child.name)"
                      :aria-label="`Subclasses of ${child.label}`"
                      class="text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text"
                    >
                      <span aria-hidden="true">{{ isExpanded(child.name) ? '▼' : '▶' }}</span>
                    </button>
                    <span v-else class="w-4"></span>

                    <span class="text-light-muted dark:text-dark-muted">{{ getNodeIcon(child) }}</span>
                    <span class="font-medium text-light-text dark:text-dark-text">{{ child.label }}</span>
                    <span class="text-xs text-light-muted dark:text-dark-muted">
                      ({{ child.count.toLocaleString() }})
                    </span>
                  </div>

                  <!-- Children -->
                  <div v-if="child.children && child.children.length > 0 && isExpanded(child.name)" class="ml-6 mt-1">
                    <div
                      v-for="subChild in child.children"
                      :key="subChild.name"
                      class="hierarchy-node cursor-pointer p-2 rounded hover:bg-light-bg dark:hover:bg-dark-border"
                      :class="{ 'bg-blue-50 dark:bg-blue-900/20': selectedClass === subChild.name }"
                      @click="selectClass(subChild.name)"
                    >
                      <div class="flex items-center gap-2">
                        <span
                          :style="inkToneVars(subChild.color || getTypeColor(subChild.code || ''))"
                          class="tone-ink"
                        >
                          {{ subChild.icon || '📄' }}
                        </span>
                        <span class="text-light-text dark:text-dark-text">{{ subChild.label }}</span>
                        <span class="text-xs text-light-muted dark:text-dark-muted">
                          ({{ subChild.count.toLocaleString() }})
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>

        <!-- Right panel: Details -->
        <div class="lg:col-span-2">
          <div class="bg-light-surface dark:bg-dark-surface rounded-lg shadow-sm">
            <!-- Tabs -->
            <div class="border-b border-light-border dark:border-dark-border">
              <nav class="flex -mb-px">
                <button
                  @click="activeTab = 'classes'"
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
                  @click="activeTab = 'properties'"
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
                  @click="activeTab = 'examples'"
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
            <div v-if="activeTab === 'classes' && selectedClassDetails" class="p-6">
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
                    class="flex items-center gap-2 p-2 bg-light-bg dark:bg-dark-bg rounded"
                  >
                    <span class="font-medium text-light-text dark:text-dark-text">
                      {{ prop.label }}
                    </span>
                    <span class="text-xs text-light-muted dark:text-dark-muted">
                      ({{ prop.range?.split('/').pop() || prop.range }})
                    </span>
                    <span v-if="prop.isArray" class="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-1 rounded">
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
            </div>

            <!-- Properties list -->
            <div v-else-if="activeTab === 'properties'" class="p-6">
              <div class="mb-4">
                <input
                  type="text"
                  placeholder="Search properties..."
                  class="w-full px-4 py-2 border border-light-border dark:border-dark-border rounded-lg bg-light-surface dark:bg-dark-surface text-light-text dark:text-dark-text"
                />
              </div>
              <div class="space-y-3">
                <div
                  v-for="[id, prop] in properties"
                  :key="id"
                  class="p-4 border border-light-border dark:border-dark-border rounded-lg hover:border-blue-300 dark:hover:border-blue-600 cursor-pointer"
                  @click="selectedProperty = id"
                >
                  <div class="flex items-center justify-between">
                    <span class="font-medium text-light-text dark:text-dark-text">{{ prop.label }}</span>
                    <span class="text-xs text-light-muted dark:text-dark-muted">{{ id }}</span>
                  </div>
                  <p class="text-sm text-light-muted dark:text-dark-muted mt-1">{{ prop.comment }}</p>
                  <div class="flex gap-4 mt-2 text-xs">
                    <span v-if="prop.domain" class="text-light-muted dark:text-dark-muted">
                      Domain: <span class="text-blue-600 dark:text-blue-400">{{ prop.domain.split('/').pop() }}</span>
                    </span>
                    <span v-if="prop.range" class="text-light-muted dark:text-dark-muted">
                      Range: <span class="text-green-600 dark:text-green-400">{{ prop.range.split('#').pop() || prop.range.split('/').pop() }}</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Examples -->
            <div v-else-if="activeTab === 'examples'" class="p-6">
              <div class="mb-4 flex gap-2">
                <button
                  @click="loadExampleData('person')"
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
                  @click="loadExampleData('organization')"
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
                  @click="loadExampleData('vessel')"
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

              <div v-if="exampleData">
                <CodeBlock
                  :code="formatJson(exampleData)"
                  language="json"
                  title="Example JSON-LD Entity"
                />
              </div>
            </div>

            <!-- No selection -->
            <div v-else class="p-6 text-center text-light-muted dark:text-dark-muted">
              Select a class from the hierarchy to view details
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Error state -->
    <div v-else class="max-w-7xl mx-auto px-4 py-8 text-center">
      <p class="text-red-600 dark:text-red-400">Failed to load ontology data</p>
    </div>
  </div>
</template>

<style scoped>
.hierarchy-node {
  transition: background-color 0.15s ease;
}
</style>
