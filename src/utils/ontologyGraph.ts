/** The graph is the class schema only; literals and missing classes are not nodes. */
export interface GraphClass {
  '@id': string
  label: string
  subClassOf?: string
  properties?: string[]
}

export interface GraphProperty {
  '@id': string
  label: string
  domain?: string
  range?: string
  usages?: { class: string; range?: string; isArray: boolean }[]
}

export interface OntologyGraphNode {
  id: string
  classId: string
  label: string
}

export interface OntologyGraphLink {
  id: string
  source: string
  target: string
  kind: 'inheritance' | 'property'
  labels: string[]
}

export interface OntologyGraphModel {
  nodes: OntologyGraphNode[]
  links: OntologyGraphLink[]
}

export function buildOntologyGraph(classes: readonly GraphClass[], properties: readonly GraphProperty[]): OntologyGraphModel {
  const nodes = [...new Map(classes.filter(cls => cls['@id']).map(cls => [cls['@id'], {
    id: cls['@id'],
    classId: cls['@id'].split('/').pop() || cls['@id'],
    label: cls.label || cls['@id'].split('/').pop() || cls['@id'],
  }])).values()]
  const ids = new Set(nodes.map(node => node.id))
  const links = new Map<string, OntologyGraphLink>()

  function add(source: string | undefined, target: string | undefined, kind: OntologyGraphLink['kind'], label: string) {
    // Match complete IDs: an external URI ending in "Entity" is not our Entity.
    if (!source || !target || !ids.has(source) || !ids.has(target)) return
    const id = JSON.stringify([source, target, kind])
    const link = links.get(id)
    if (link) {
      if (!link.labels.includes(label)) link.labels.push(label)
    } else {
      links.set(id, { id, source, target, kind, labels: [label] })
    }
  }

  for (const cls of classes) add(cls['@id'], cls.subClassOf, 'inheritance', 'subclass of')
  for (const prop of properties) {
    const label = prop.label || prop['@id']
    if (prop.usages?.length) {
      for (const usage of prop.usages) add(usage.class, usage.range, 'property', label)
    } else if (prop.domain) {
      add(prop.domain, prop.range, 'property', label)
    } else {
      // Shared fields have no global RDFS domain: multiple domains would imply
      // an intersection. The canonical class field lists still describe each
      // individual relationship in this schema diagram.
      for (const cls of classes) {
        if (cls.properties?.includes(prop['@id'])) add(cls['@id'], prop.range, 'property', label)
      }
    }
  }
  return { nodes, links: [...links.values()] }
}
