import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildOntologyGraph } from '../.test-build/utils/ontologyGraph.js'

const uri = name => `https://www.ammitto.org/ontology/${name}`
const classes = [
  { '@id': uri('Entity'), label: 'Entity' },
  { '@id': uri('PersonEntity'), label: 'Person', subClassOf: uri('Entity') },
  { '@id': uri('Name'), label: 'Name' },
]
const property = (name, domain, range, label = name) => ({ '@id': uri(name), domain, range, label })

test('uses only declared classes, retains isolated classes and never creates literal or dangling nodes', () => {
  const result = buildOntologyGraph(classes, [
    property('names', uri('Entity'), uri('Name')),
    property('age', uri('Entity'), 'http://www.w3.org/2001/XMLSchema#integer'),
    property('missing', uri('Entity'), uri('Missing')),
    property('missingDomain', uri('Missing'), uri('Entity')),
  ])
  assert.deepEqual(result.nodes.map(node => node.classId), ['Entity', 'PersonEntity', 'Name'])
  assert.equal(result.links.length, 2)
  assert.deepEqual(buildOntologyGraph(classes, []).nodes, result.nodes)
})

test('preserves direction and keeps inheritance distinct from properties with the same endpoints', () => {
  const { links } = buildOntologyGraph(classes, [property('related', uri('PersonEntity'), uri('Entity'))])
  assert.deepEqual(links.map(({ source, target, kind, labels }) => ({ source, target, kind, labels })), [
    { source: uri('PersonEntity'), target: uri('Entity'), kind: 'inheritance', labels: ['subclass of'] },
    { source: uri('PersonEntity'), target: uri('Entity'), kind: 'property', labels: ['related'] },
  ])
})

test('combines parallel properties without losing their labels or duplicating repeated records', () => {
  const names = property('names', uri('Entity'), uri('Name'), 'Names')
  const { links } = buildOntologyGraph(classes, [names, names, property('aliases', uri('Entity'), uri('Name'), 'Aliases')])
  assert.equal(links.filter(link => link.kind === 'property').length, 1)
  assert.deepEqual(links.find(link => link.kind === 'property').labels, ['Names', 'Aliases'])
})

test('does not conflate external class URIs with a matching local suffix', () => {
  const { links } = buildOntologyGraph(classes, [property('foreign', uri('Entity'), 'https://other.example/Name')])
  assert.equal(links.length, 1)
  assert.equal(links[0].kind, 'inheritance')
})

test('does not mutate API inputs and returns independent link records', () => {
  const original = JSON.stringify(classes)
  const props = [property('names', uri('Entity'), uri('Name'))]
  const first = buildOntologyGraph(classes, props)
  first.links[0].source = 'changed by a simulation'
  first.links[1].labels.push('changed')
  assert.equal(JSON.stringify(classes), original)
  assert.equal(props[0].domain, uri('Entity'))
  const second = buildOntologyGraph(classes, props)
  assert.equal(second.links[0].source, uri('PersonEntity'))
  assert.deepEqual(second.links[1].labels, ['names'])
})

test('the committed schema yields exactly its classes and class-valued declared relationships', () => {
  const schema = JSON.parse(readFileSync(new URL('../public/api/v1/ontology/classes.jsonld', import.meta.url)))['@graph']
  const properties = JSON.parse(readFileSync(new URL('../public/api/v1/ontology/properties.jsonld', import.meta.url)))['@graph']
  const result = buildOntologyGraph(schema, properties)
  const ids = new Set(schema.map(cls => cls['@id']))
  assert.deepEqual(new Set(result.nodes.map(node => node.id)), ids)
  assert.ok(result.links.some(link => link.source === uri('Entity') && link.target === uri('SanctionEntry') && link.labels.includes('Has Sanction Entry')))
  assert.ok(!result.nodes.some(node => node.classId === 'Registration'))
  assert.ok(result.links.every(link => ids.has(link.source) && ids.has(link.target)))
  assert.deepEqual(buildOntologyGraph([], properties), { nodes: [], links: [] })
})

test('keeps different explicit domains when the producer repeats a property ID', () => {
  const schema = ['Entry', 'List', 'Authority'].map(name => ({ '@id': uri(name), label: name }))
  const properties = [
    property('authority', uri('Entry'), uri('Authority'), 'Authority'),
    property('authority', uri('List'), uri('Authority'), 'Authority'),
  ]
  const { links } = buildOntologyGraph(schema, properties)
  assert.equal(links.length, 2)
  assert.deepEqual(new Set(links.map(link => link.source)), new Set([uri('Entry'), uri('List')]))
  assert.ok(links.every(link => link.target === uri('Authority')))
})
