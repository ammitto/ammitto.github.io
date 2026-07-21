import { ref, computed } from 'vue'

/**
 * Ontology class definition
 */
export interface OntologyClass {
  '@id': string
  '@type': string
  label: string
  comment: string
  subClassOf?: string
  properties?: string[]
}

/**
 * Ontology property definition
 */
export interface OntologyProperty {
  '@id': string
  '@type': string
  label: string
  comment: string
  domain?: string
  range?: string
  isArray?: boolean
}

/**
 * Hierarchy node for visualization
 */
export interface HierarchyNode {
  name: string
  label: string
  code?: string
  count: number
  icon?: string
  color?: string
  children: HierarchyNode[]
}

/**
 * Classes response from API
 */
interface ClassesResponse {
  '@context': string
  '@graph': OntologyClass[]
}

/**
 * Properties response from API
 */
interface PropertiesResponse {
  '@context': string
  '@graph': OntologyProperty[]
}

// Global state
const classes = ref<Map<string, OntologyClass>>(new Map())
const properties = ref<Map<string, OntologyProperty>>(new Map())
const hierarchy = ref<HierarchyNode | null>(null)
const isLoading = ref(false)
const isLoaded = ref(false)
const error = ref<string | null>(null)

// Check if running in browser
const isBrowser = typeof window !== 'undefined'

// Base URL for API
function getApiBase(): string {
  if (isBrowser) {
    return import.meta.env.BASE_URL || '/'
  }
  // During SSG build, use the file system path
  return '/'
}

/**
 * Load ontology data from API
 */
async function loadOntology(): Promise<void> {
  if (isLoaded.value || isLoading.value) return

  // Skip during SSR/build - data will be loaded client-side
  if (!isBrowser) {
    isLoading.value = false
    return
  }

  isLoading.value = true
  error.value = null

  try {
    const API_BASE = getApiBase()

    // Load all ontology files in parallel
    const [classesRes, propertiesRes, hierarchyRes] = await Promise.all([
      fetch(`${API_BASE}api/v1/ontology/classes.jsonld`),
      fetch(`${API_BASE}api/v1/ontology/properties.jsonld`),
      fetch(`${API_BASE}api/v1/ontology/hierarchy.json`),
    ])

    if (!classesRes.ok) {
      throw new Error(`Failed to load classes: ${classesRes.status}`)
    }
    if (!propertiesRes.ok) {
      throw new Error(`Failed to load properties: ${propertiesRes.status}`)
    }
    if (!hierarchyRes.ok) {
      throw new Error(`Failed to load hierarchy: ${hierarchyRes.status}`)
    }

    // Parse responses
    const classesData: ClassesResponse = await classesRes.json()
    const propertiesData: PropertiesResponse = await propertiesRes.json()
    const hierarchyData: HierarchyNode = await hierarchyRes.json()

    // Build class map
    for (const cls of classesData['@graph']) {
      const id = cls['@id'].split('/').pop() || cls['@id']
      classes.value.set(id, cls)
    }

    // Build property map
    for (const prop of propertiesData['@graph']) {
      const id = prop['@id'].split('/').pop() || prop['@id']
      properties.value.set(id, prop)
    }

    // Store hierarchy
    hierarchy.value = hierarchyData

    isLoaded.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load ontology'
    console.error('Failed to load ontology:', e)
  } finally {
    isLoading.value = false
  }
}

/**
 * Get class by ID
 */
function getClass(id: string): OntologyClass | undefined {
  return classes.value.get(id)
}

/**
 * Get property by ID
 */
function getProperty(id: string): OntologyProperty | undefined {
  return properties.value.get(id)
}

/**
 * Get all classes as array
 */
function getAllClasses(): OntologyClass[] {
  return Array.from(classes.value.values())
}

/**
 * Get all properties as array
 */
function getAllProperties(): OntologyProperty[] {
  return Array.from(properties.value.values())
}

/**
 * Get properties for a specific class
 */
function getPropertiesForClass(classId: string): OntologyProperty[] {
  const cls = classes.value.get(classId)
  if (!cls || !cls.properties) return []

  return cls.properties
    .map((propUri) => {
      const propId = propUri.split('/').pop() || propUri
      return properties.value.get(propId)
    })
    .filter(Boolean) as OntologyProperty[]
}

/**
 * Get subclasses of a class
 */
function getSubclasses(classId: string): OntologyClass[] {
  return getAllClasses().filter((cls) => cls.subClassOf?.includes(classId))
}

/**
 * Get root classes (no parent)
 */
function getRootClasses(): OntologyClass[] {
  return getAllClasses().filter((cls) => !cls.subClassOf)
}

/**
 * Build class tree from hierarchy
 */
function buildClassTree(node: HierarchyNode, depth = 0): { node: HierarchyNode; depth: number }[] {
  const result: { node: HierarchyNode; depth: number }[] = []

  result.push({ node, depth })

  if (node.children) {
    for (const child of node.children) {
      result.push(...buildClassTree(child, depth + 1))
    }
  }

  return result
}

/**
 * Flatten hierarchy for display
 */
const flattenedHierarchy = computed(() => {
  if (!hierarchy.value) return []
  return buildClassTree(hierarchy.value)
})

/**
 * Load example entity
 */
async function loadExample(type: 'person' | 'organization' | 'vessel'): Promise<Record<string, unknown> | null> {
  if (!isBrowser) return null

  try {
    const API_BASE = getApiBase()
    const response = await fetch(`${API_BASE}api/v1/ontology/examples/${type}.jsonld`)

    if (!response.ok) {
      throw new Error(`Failed to load example: ${response.status}`)
    }

    return await response.json()
  } catch (e) {
    console.error(`Failed to load example ${type}:`, e)
    return null
  }
}

/**
 * Composable for ontology data access
 */
export function useOntologyData() {
  // Load data on first use
  if (!isLoaded.value && !isLoading.value) {
    loadOntology()
  }

  const classCount = computed(() => classes.value.size)
  const propertyCount = computed(() => properties.value.size)

  return {
    // State
    isLoading,
    isLoaded,
    error,
    classCount,
    propertyCount,

    // Data
    classes,
    properties,
    hierarchy,
    flattenedHierarchy,

    // Methods
    loadOntology,
    getClass,
    getProperty,
    getAllClasses,
    getAllProperties,
    getPropertiesForClass,
    getSubclasses,
    getRootClasses,
    loadExample,
  }
}
