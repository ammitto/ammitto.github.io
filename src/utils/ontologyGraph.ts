/** The graph is the class schema only; literals and missing classes are not nodes. */
export interface GraphClass {
  '@id': string
  label: string
  subClassOf?: string
}

export interface GraphProperty {
  '@id': string
  label: string
  domain?: string
  range?: string
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
  for (const prop of properties) add(prop.domain, prop.range, 'property', prop.label || prop['@id'])
  return { nodes, links: [...links.values()] }
}
