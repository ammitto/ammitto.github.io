<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useOntologyData, type HierarchyNode } from '@/composables/useOntologyData'
import CodeBlock from '@/components/molecules/CodeBlock.vue'

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

// Get color for entity type
function getTypeColor(type: string): string {
  const colors: Record<string, string> = {
    person: '#3b82f6',
    organization: '#10b981',
    vessel: '#8b5cf6',
    aircraft: '#f59e0b',
  }
  return colors[type] || '#6b7280'
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
  <div class="ontology-browser min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Header -->
    <header class="bg-white dark:bg-gray-800 shadow-sm">
      <div class="max-w-7xl mx-auto px-4 py-6">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
          Ontology Browser
        </h1>
        <p class="mt-2 text-gray-600 dark:text-gray-400">
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
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Class Hierarchy
            </h2>

            <!-- Hierarchy tree -->
            <div class="space-y-1" v-if="hierarchy">
              <template v-for="child in hierarchy.children" :key="child.name">
                <div
                  class="hierarchy-node cursor-pointer p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                  :class="{ 'bg-blue-50 dark:bg-blue-900/20': selectedClass === child.name }"
                  @click="selectClass(child.name)"
                >
                  <div class="flex items-center gap-2">
                    <span
                      v-if="child.children && child.children.length > 0"
                      @click.stop="toggleNode(child.name)"
                      class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      {{ isExpanded(child.name) ? '▼' : '▶' }}
                    </span>
                    <span v-else class="w-4"></span>

                    <span class="text-gray-600 dark:text-gray-300">{{ getNodeIcon(child) }}</span>
                    <span class="font-medium text-gray-900 dark:text-white">{{ child.label }}</span>
                    <span class="text-xs text-gray-500 dark:text-gray-400">
                      ({{ child.count.toLocaleString() }})
                    </span>
                  </div>

                  <!-- Children -->
                  <div v-if="child.children && child.children.length > 0 && isExpanded(child.name)" class="ml-6 mt-1">
                    <div
                      v-for="subChild in child.children"
                      :key="subChild.name"
                      class="hierarchy-node cursor-pointer p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                      :class="{ 'bg-blue-50 dark:bg-blue-900/20': selectedClass === subChild.name }"
                      @click="selectClass(subChild.name)"
                    >
                      <div class="flex items-center gap-2">
                        <span
                          :style="{ color: subChild.color || getTypeColor(subChild.code || '') }"
                          class="text-gray-600 dark:text-gray-300"
                        >
                          {{ subChild.icon || '📄' }}
                        </span>
                        <span class="text-gray-900 dark:text-white">{{ subChild.label }}</span>
                        <span class="text-xs text-gray-500 dark:text-gray-400">
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
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
            <!-- Tabs -->
            <div class="border-b border-gray-200 dark:border-gray-700">
              <nav class="flex -mb-px">
                <button
                  @click="activeTab = 'classes'"
                  :class="[
                    activeTab === 'classes'
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300',
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
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300',
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
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300',
                    'px-4 py-3 border-b-2 font-medium text-sm'
                  ]"
                >
                  Examples
                </button>
              </nav>
            </div>

            <!-- Class details -->
            <div v-if="activeTab === 'classes' && selectedClassDetails" class="p-6">
              <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-4">
                {{ selectedClassDetails.label }}
              </h3>
              <p class="text-gray-600 dark:text-gray-400 mb-6">
                {{ selectedClassDetails.comment }}
              </p>

              <!-- Parent class -->
              <div v-if="selectedClassDetails.subClassOf" class="mb-4">
                <span class="text-sm font-medium text-gray-500 dark:text-gray-400">Subclass of:</span>
                <button
                  @click="selectClass(selectedClassDetails.subClassOf?.split('/').pop() || '')"
                  class="ml-2 text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {{ selectedClassDetails.subClassOf.split('/').pop() }}
                </button>
              </div>

              <!-- Properties -->
              <div v-if="selectedClassProperties.length > 0" class="mb-6">
                <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Properties
                </h4>
                <div class="space-y-2">
                  <div
                    v-for="prop in selectedClassProperties"
                    :key="prop['@id']"
                    class="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded"
                  >
                    <span class="font-medium text-gray-900 dark:text-white">
                      {{ prop.label }}
                    </span>
                    <span class="text-xs text-gray-500 dark:text-gray-400">
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
                <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Subclasses
                </h4>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="sub in selectedClassSubclasses"
                    :key="sub['@id']"
                    @click="selectClass(sub['@id'].split('/').pop() || '')"
                    class="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600"
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
                  class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div class="space-y-3">
                <div
                  v-for="[id, prop] in properties"
                  :key="id"
                  class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-300 dark:hover:border-blue-600 cursor-pointer"
                  @click="selectedProperty = id"
                >
                  <div class="flex items-center justify-between">
                    <span class="font-medium text-gray-900 dark:text-white">{{ prop.label }}</span>
                    <span class="text-xs text-gray-500 dark:text-gray-400">{{ id }}</span>
                  </div>
                  <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">{{ prop.comment }}</p>
                  <div class="flex gap-4 mt-2 text-xs">
                    <span v-if="prop.domain" class="text-gray-500 dark:text-gray-400">
                      Domain: <span class="text-blue-600 dark:text-blue-400">{{ prop.domain.split('/').pop() }}</span>
                    </span>
                    <span v-if="prop.range" class="text-gray-500 dark:text-gray-400">
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
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
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
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
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
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
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
            <div v-else class="p-6 text-center text-gray-500 dark:text-gray-400">
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
