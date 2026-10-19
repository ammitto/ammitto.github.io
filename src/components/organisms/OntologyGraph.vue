<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type SimulationNodeDatum } from 'd3-force'
import { select } from 'd3-selection'
import { zoom, zoomIdentity, zoomTransform, type ZoomBehavior } from 'd3-zoom'
import { buildOntologyGraph, type GraphClass, type GraphProperty, type OntologyGraphLink, type OntologyGraphNode } from '@/utils/ontologyGraph'

const props = defineProps<{
  classes: GraphClass[]
  properties: GraphProperty[]
  selectedClass: string | null
}>()
const emit = defineEmits<{ select: [classId: string] }>()
interface LayoutNode extends OntologyGraphNode, SimulationNodeDatum { x: number; y: number }
interface LayoutLink extends Omit<OntologyGraphLink, 'source' | 'target'> { source: LayoutNode; target: LayoutNode }
const svg = ref<SVGSVGElement | null>(null)
const nodes = ref<LayoutNode[]>([])
const links = ref<LayoutLink[]>([])
const transform = ref('')
const scale = ref(1)
const ready = ref(false)
const helpOpen = ref(false)
const helpButton = ref<HTMLButtonElement | null>(null)
function closeHelp(event: FocusEvent) {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) helpOpen.value = false
}
function dismissHelp() {
  helpOpen.value = false
  helpButton.value?.focus()
}
const model = computed(() => buildOntologyGraph(props.classes, props.properties))
const selected = computed(() => model.value.nodes.find(node => node.classId === props.selectedClass))
const relationships = computed(() => model.value.links.filter(link => link.source === selected.value?.id || link.target === selected.value?.id))
const labels = computed(() => new Map(model.value.nodes.map(node => [node.id, node.label])))
let behavior: ZoomBehavior<SVGSVGElement, unknown> | undefined
let resetScale = 1
let resetX = 0
let resetY = 0

function lineEnd(link: LayoutLink): { x: number; y: number } {
  const dx = link.target.x - link.source.x
  const dy = link.target.y - link.source.y
  const inset = Math.min((nodeWidth(link.target) / 2 + 7) / (Math.abs(dx) || 1), 29 / (Math.abs(dy) || 1), 0.9)
  return { x: link.target.x - dx * inset, y: link.target.y - dy * inset }
}
function nodeWidth(node: OntologyGraphNode): number { return Math.max(92, node.label.length * 7.4 + 24) }
function choose(classId: string) { emit('select', classId) }
function related(link: OntologyGraphLink | LayoutLink): boolean {
  const source = typeof link.source === 'string' ? link.source : link.source.id
  const target = typeof link.target === 'string' ? link.target : link.target.id
  return source === selected.value?.id || target === selected.value?.id
}
function reset() {
  if (svg.value && behavior) select(svg.value).call(behavior.transform, zoomIdentity.translate(resetX, resetY).scale(resetScale))
}
function changeZoom(factor: number) {
  if (svg.value && behavior) select(svg.value).call(behavior.scaleBy, factor)
}
function pan(x: number, y: number) {
  if (svg.value && behavior) select(svg.value).call(behavior.translateBy, x / scale.value, y / scale.value)
}
function revealNode(node: LayoutNode, event: FocusEvent) {
  if (!svg.value || !behavior || !(event.currentTarget as Element).matches(':focus-visible')) return
  const camera = zoomTransform(svg.value)
  const [x, y] = camera.apply([node.x, node.y])
  // Include the focus stroke and breathing room inside the clipped canvas.
  const halfWidth = (nodeWidth(node) / 2 + 4) * camera.k
  const halfHeight = 26 * camera.k
  const dx = x - halfWidth < 12 ? 12 - (x - halfWidth) : x + halfWidth > 988 ? 988 - (x + halfWidth) : 0
  const dy = y - halfHeight < 12 ? 12 - (y - halfHeight) : y + halfHeight > 608 ? 608 - (y + halfHeight) : 0
  if (dx || dy) select(svg.value).call(behavior.translateBy, dx / camera.k, dy / camera.k)
}
function onKey(event: KeyboardEvent) {
  // Node activation belongs to the focused node, not to the canvas.
  if (event.target !== svg.value) return
  const actions: Record<string, () => void> = {
    ArrowLeft: () => pan(50, 0), ArrowRight: () => pan(-50, 0),
    ArrowUp: () => pan(0, 50), ArrowDown: () => pan(0, -50),
    '+': () => changeZoom(1.25), '=': () => changeZoom(1.25),
    '-': () => changeZoom(0.8), Home: reset,
  }
  if (actions[event.key]) { event.preventDefault(); actions[event.key]() }
}
function layout() {
  if (!svg.value) return
  // Separate starting positions keep disconnected components from receiving
  // extreme repulsion when every node starts at the same point.
  const points: LayoutNode[] = model.value.nodes.map((node, index) => {
    const angle = index * Math.PI * (3 - Math.sqrt(5))
    const radius = 100 * Math.sqrt(index)
    return { ...node, x: 500 + Math.cos(angle) * radius, y: 310 + Math.sin(angle) * radius }
  })
  // D3 mutates its simulation data; never give it the API records or model links.
  const edges = model.value.links.map(link => ({ ...link, source: link.source, target: link.target }))
  const simulation = forceSimulation(points)
    .force('link', forceLink<LayoutNode, typeof edges[number]>(edges).id(node => node.id).distance(170))
    .force('charge', forceManyBody().strength(-650))
    .force('collide', forceCollide<LayoutNode>(node => nodeWidth(node) / 2 + 18))
    .force('center', forceCenter(500, 310))
    .stop()
  // A settled layout avoids ambient movement and respects reduced motion by default.
  simulation.tick(260)
  nodes.value = points
  links.value = edges as unknown as LayoutLink[]
  if (points.length) {
    const left = Math.min(...points.map(node => node.x - nodeWidth(node) / 2)) - 35
    const right = Math.max(...points.map(node => node.x + nodeWidth(node) / 2)) + 35
    const top = Math.min(...points.map(node => node.y)) - 55
    const bottom = Math.max(...points.map(node => node.y)) + 55
    resetScale = Math.min(1.4, 1000 / (right - left), 620 / (bottom - top))
    resetX = 500 - (left + right) / 2 * resetScale
    resetY = 310 - (top + bottom) / 2 * resetScale
  }
  ready.value = true
  reset()
}
onMounted(() => {
  if (!svg.value) return
  behavior = zoom<SVGSVGElement, unknown>()
    .extent([[0, 0], [1000, 620]])
    .scaleExtent([0.2, 4])
    // Keep normal document scrolling; wheel zoom is opt-in with Ctrl/Command.
    .filter(event => event.type === 'wheel' ? event.ctrlKey || event.metaKey : !event.button && !(event.target as Element).closest('.graph-node'))
    .on('zoom', event => { transform.value = event.transform.toString(); scale.value = event.transform.k })
  select(svg.value).call(behavior).on('dblclick.zoom', null)
  layout()
})
watch(model, layout)
onBeforeUnmount(() => { if (svg.value) select(svg.value).on('.zoom', null) })
</script>

<template>
  <section class="ontology-graph mb-6 rounded-lg bg-light-surface dark:bg-dark-surface shadow-sm p-4" aria-labelledby="ontology-graph-title">
    <div class="relative flex items-start justify-between gap-3">
      <div>
        <h2 id="ontology-graph-title" class="text-lg font-semibold text-light-text dark:text-dark-text">Class relationships</h2>
        <p class="text-sm text-light-muted dark:text-dark-muted">{{ nodes.length }} ontology classes · select a class to view its details below.</p>
      </div>
      <div class="graph-help" @focusout="closeHelp" @keydown.esc.stop.prevent="dismissHelp">
        <button ref="helpButton" type="button" class="graph-help-button" aria-label="Graph help" title="Graph help"
          :aria-expanded="helpOpen" aria-controls="ontology-graph-help" @click="helpOpen = !helpOpen">
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3v.01" /></svg>
        </button>
        <p v-show="helpOpen" id="ontology-graph-help" class="graph-help-content text-sm text-light-text dark:text-dark-text">
          Drag the background to pan. Focus the graph and use arrow keys to pan, + / − to zoom, or Home to fit the graph to view. Use Ctrl or Command + scroll to zoom.
        </p>
      </div>
    </div>
    <div class="graph-canvas mt-3 rounded-lg border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg">
      <svg ref="svg" class="block w-full" viewBox="0 0 1000 620" tabindex="0" role="group"
        aria-label="Ontology class graph" aria-describedby="ontology-graph-help" :data-ready="ready" :data-scale="scale" @keydown="onKey">
        <defs><marker id="ontology-graph-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="rgb(var(--color-brand-link))" /></marker></defs>
        <g :transform="transform" class="graph-viewport">
          <g v-for="link in links" :key="link.id" class="graph-link" :class="{ 'is-related': related(link), 'is-inheritance': link.kind === 'inheritance' }">
            <line :x1="link.source.x" :y1="link.source.y" :x2="lineEnd(link).x" :y2="lineEnd(link).y" marker-end="url(#ontology-graph-arrow)" />
            <title>{{ link.source.label }} → {{ link.labels.join(', ') }} → {{ link.target.label }}</title>
          </g>
          <g v-for="node in nodes" :key="node.id" class="graph-node" :class="{ 'is-selected': node.classId === selectedClass }"
            :transform="`translate(${node.x},${node.y})`" role="button" tabindex="0"
            :aria-label="`View ${node.label} class`" :aria-pressed="node.classId === selectedClass"
            @focus="revealNode(node, $event)" @click="choose(node.classId)" @keydown.enter.prevent="choose(node.classId)" @keydown.space.prevent="choose(node.classId)">
            <rect :x="-nodeWidth(node) / 2" y="-22" :width="nodeWidth(node)" height="44" rx="8" />
            <text text-anchor="middle" dominant-baseline="central">{{ node.label }}</text>
          </g>
        </g>
      </svg>
      <div class="graph-controls" role="group" aria-label="Graph view controls">
        <button type="button" aria-label="Zoom out" title="Zoom out" @click="changeZoom(0.8)">
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M5 12h14" /></svg>
        </button>
        <button type="button" aria-label="Zoom in" title="Zoom in" @click="changeZoom(1.25)">
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M5 12h14M12 5v14" /></svg>
        </button>
        <button type="button" aria-label="Fit to view" title="Fit to view" @click="reset">
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><path d="M4 4l5 5M5 9h4V5m11-1-5 5m0-4v4h4M4 20l5-5m-4 0h4v4m11 1-5-5m0 4v-4h4" /></svg>
        </button>
      </div>
    </div>
    <div class="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-light-muted dark:text-dark-muted" aria-label="Graph legend">
      <span>Solid arrow: subclass of</span><span>Dashed arrow: class property</span>
    </div>
    <div class="mt-4">
      <div class="text-sm text-light-muted dark:text-dark-muted" aria-live="polite" aria-atomic="true">
        <p v-if="!selected">Choose a class to read its relationships.</p>
        <template v-else>
          <p class="font-medium text-light-text dark:text-dark-text">{{ selected.label }} relationships</p>
          <ul v-if="relationships.length" class="mt-1 space-y-1">
            <li v-for="link in relationships" :key="link.id">{{ labels.get(link.source) }} → {{ link.labels.join(', ') }} → {{ labels.get(link.target) }}</li>
          </ul>
          <p v-else>No class relationships are declared for this class.</p>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.graph-controls { position: absolute; top: 0.5rem; right: 0.5rem; display: flex; flex-direction: column; gap: 0.25rem; }
.graph-controls button, .graph-help-button { display: inline-flex; align-items: center; justify-content: center; width: 2.75rem; height: 2.75rem; padding: 0; background: rgb(var(--color-light-surface)); border: 1px solid rgb(var(--color-light-border)); border-radius: 0.375rem; color: rgb(var(--color-light-text)); }
.graph-controls button svg, .graph-help-button svg { width: 1.25rem; height: 1.25rem; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.graph-controls button:hover, .graph-help-button:hover { border-color: rgb(var(--color-brand-link)); }
.dark .graph-controls button, .dark .graph-help-button { background: rgb(var(--color-dark-surface)); border-color: rgb(var(--color-dark-border)); color: rgb(var(--color-dark-text)); }
.graph-help { flex-shrink: 0; }
.graph-help-content { position: absolute; top: calc(100% + 0.5rem); right: 0; z-index: 10; width: min(22rem, 100%); padding: 1rem; background: rgb(var(--color-light-surface)); border: 1px solid rgb(var(--color-light-border)); border-radius: 0.5rem; box-shadow: 0 4px 12px rgb(0 0 0 / 0.15); }
.dark .graph-help-content { background: rgb(var(--color-dark-surface)); border-color: rgb(var(--color-dark-border)); }
button:focus-visible, svg:focus-visible { outline: 3px solid rgb(var(--color-brand-link)); outline-offset: 3px; }
.graph-canvas { position: relative; overflow: hidden; padding-right: 3.75rem; }
.graph-canvas > svg { min-height: 260px; max-height: 620px; cursor: grab; touch-action: none; }
.graph-canvas > svg:active { cursor: grabbing; }
.graph-link { color: rgb(var(--color-light-muted)); }
.graph-link line { stroke: currentColor; stroke-width: 1.4; }
.graph-link:not(.is-inheritance) line { stroke-dasharray: 5 5; }
.graph-link.is-related { color: rgb(var(--color-brand-link)); }
.graph-link.is-related line { stroke-width: 2.5; }
.graph-node { cursor: pointer; outline: none; }
.graph-node rect { fill: rgb(var(--color-light-surface)); stroke: rgb(var(--color-light-muted)); stroke-width: 1.5; }
.graph-node text { fill: rgb(var(--color-light-text)); font-family: inherit; font-size: 14px; pointer-events: none; }
.graph-node.is-selected rect, .graph-node:focus-visible rect { stroke: rgb(var(--color-brand-link)); stroke-width: 4; }
.dark .graph-link { color: rgb(var(--color-dark-muted)); }
.dark .graph-link.is-related { color: rgb(var(--color-brand-link)); }
.dark .graph-node rect { fill: rgb(var(--color-dark-surface)); stroke: rgb(var(--color-dark-muted)); }
.dark .graph-node text { fill: rgb(var(--color-dark-text)); }
.dark .graph-node.is-selected rect, .dark .graph-node:focus-visible rect { stroke: rgb(var(--color-brand-link)); }
</style>
