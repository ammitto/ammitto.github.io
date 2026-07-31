/**
 * Runtime tests for the producer -> site node normalizer.
 *
 * Run with `npm run test:unit`. Uses Node's built-in test runner and Node's
 * native TypeScript type stripping, so it adds no dependency; `vue-tsc` and
 * `vite build` cannot exercise this module's runtime behaviour.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeNode, normalizeGraph, toNodeIri } from '../src/utils/normalizeNode.ts'

const ENTITY = 'https://www.ammitto.org/entity/eu/eu1'
const ENTRY = 'https://www.ammitto.org/entry/eu/consolidated-list/eu1'

test('converts the producer vocabulary into the site vocabulary', () => {
  const node = normalizeNode<Record<string, any>>({
    '@id': ENTITY,
    '@type': 'PersonEntity',
    entityType: 'person',
    names: [{ '@type': 'NameVariant', fullName: 'A B', isPrimary: true }],
    sourceReferences: [{ sourceCode: 'eu', referenceNumber: 'EU.1', retrievedAt: 'x' }],
    hasSanctionEntry: [ENTRY],
  })!

  assert.equal(node.id, ENTITY)
  assert.equal(node['@id'], ENTITY, 'keyword must survive for nested node references')
  assert.equal(node.entity_type, 'person')
  assert.equal(node.names[0].full_name, 'A B')
  assert.equal(node.names[0].is_primary, true)
  assert.equal(node.source_references[0].source_code, 'eu')
  assert.equal(node.source_references[0].retrieved_at, 'x')
  assert.deepEqual(node.sanction_entry_ids, [ENTRY])
})

test('passes an older snake_case snapshot through unchanged', () => {
  const input = {
    id: ENTITY,
    entity_type: 'person',
    names: [{ full_name: 'A B', is_primary: true }],
    sanction_entry_ids: [ENTRY],
  }
  assert.deepEqual(normalizeNode(input), input)
})

test('is idempotent', () => {
  const once = normalizeNode({ '@id': ENTITY, entityType: 'person', hasSanctionEntry: [ENTRY] })
  assert.deepEqual(normalizeNode(once), once)
})

test('lets the producer spelling win when a node carries both', () => {
  const node = normalizeNode<Record<string, any>>({
    '@id': ENTITY,
    id: 'legacy-short-id',
    entityType: 'canonical',
    entity_type: 'legacy',
  })!
  assert.equal(node.id, ENTITY)
  assert.equal(node.entity_type, 'canonical')
})

test('keeps nested @id node references intact', () => {
  const node = normalizeNode<Record<string, any>>({
    '@id': ENTRY,
    authority: { '@id': 'https://www.ammitto.org/authority/eu' },
    regime: { '@id': 'https://www.ammitto.org/regime/eu' },
    legalBases: [{ '@id': 'https://www.ammitto.org/legal-instrument/eu/x' }],
  })!
  assert.equal(node.authority['@id'], 'https://www.ammitto.org/authority/eu')
  assert.equal(node.regime['@id'], 'https://www.ammitto.org/regime/eu')
  assert.equal(node.legal_bases[0]['@id'], 'https://www.ammitto.org/legal-instrument/eu/x')
})

test('renames the fields whose site name differs by more than case', () => {
  const node = normalizeNode<Record<string, any>>({
    '@id': ENTITY,
    linkedEntities: [{ targetId: 'https://a/1', relationship: 'owner', targetName: 'N' }],
    groupId: 'https://www.ammitto.org/group/cn/1',
    legalCitations: [{ legalInstrumentId: 'https://i/1', citationType: 'legal_basis' }],
  })!
  assert.equal(node.linked_entities[0].entity_id, 'https://a/1')
  assert.equal(node.linked_entities[0].relationship_type, 'owner')
  assert.equal(node.group_id, 'https://www.ammitto.org/group/cn/1')
  assert.equal(node.legal_citations[0].legal_instrument_id, 'https://i/1')
  assert.equal(node.legal_citations[0].citation_type, 'legal_basis')
})

test('emits both country spellings the site reads', () => {
  const node = normalizeNode<Record<string, any>>({
    '@id': ENTITY,
    countryIsoCode: 'FR',
    addresses: [{ countryIsoCode: 'DE' }],
  })!
  assert.equal(node.country_code, 'FR')
  assert.equal(node.country_iso_code, 'FR')
  assert.equal(node.addresses[0].country_code, 'DE')
  assert.equal(node.addresses[0].country_iso_code, 'DE')
})

test('leaves source-supplied provenance keys opaque', () => {
  const node = normalizeNode<Record<string, any>>({
    '@id': ENTRY,
    rawSourceData: { sourceFormat: 'csv', sourceSpecificFields: { 'au:controlDate': '1', keepCamel: '2' } },
  })!
  assert.equal(node.raw_source_data.source_format, 'csv')
  assert.deepEqual(node.raw_source_data.source_specific_fields, { 'au:controlDate': '1', keepCamel: '2' })
})

test('leaves prefixed keys alone', () => {
  const node = normalizeNode<Record<string, any>>({ '@id': ENTRY, 'eu:programme': 'v', normalKey: 1 })!
  assert.equal(node['eu:programme'], 'v')
  assert.equal(node.normal_key, 1)
})

test('accepts every legal shape of the entry edge and drops the rest', () => {
  assert.deepEqual(normalizeNode<any>({ '@id': ENTITY, hasSanctionEntry: ENTRY })!.sanction_entry_ids, [ENTRY])
  assert.deepEqual(
    normalizeNode<any>({ '@id': ENTITY, hasSanctionEntry: [{ '@id': ENTRY }] })!.sanction_entry_ids,
    [ENTRY],
  )
  assert.deepEqual(
    normalizeNode<any>({
      '@id': ENTITY,
      hasSanctionEntry: [null, 5, '', '   ', { nope: 1 }, { '@id': '  ' }, `  ${ENTRY}  `],
    })!.sanction_entry_ids,
    [ENTRY],
    'blank and non-IRI members must not become fetch paths',
  )
})

test('does not let hostile keys reach the prototype', () => {
  const node = normalizeNode<Record<string, any>>(
    JSON.parse('{"__proto__": {"polluted": true}, "constructor": 1, "toString": 2, "@id": "x"}'),
  )!
  assert.equal(({} as any).polluted, undefined, 'Object.prototype must not be mutated')
  assert.equal(typeof ({}).toString, 'function')
  assert.ok(Object.prototype.hasOwnProperty.call(node, '__proto__'), 'key stays an own property')
  assert.ok(Object.keys(node).includes('constructor'), 'key must not be renamed via prototype lookup')
})

test('preserves nulls and array-ness so the consumer walk stays safe', () => {
  const node = normalizeNode<Record<string, any>>({ '@id': 'x', names: null, addresses: [null] })!
  assert.equal(node.names, null)
  assert.deepEqual(node.addresses, [null])
})

test('rejects non-objects instead of throwing', () => {
  for (const input of [null, undefined, 'str', 7, [1, 2], true]) {
    assert.equal(normalizeNode(input), null)
  }
})

test('drops a subtree past the depth cap instead of half-converting it', () => {
  let deep: any = { leafValue: 1 }
  for (let i = 0; i < 50_000; i += 1) deep = { nestedLevel: deep }

  let node: any
  assert.doesNotThrow(() => {
    node = normalizeNode({ '@id': 'x', deepThing: deep })
  })

  let cursor = node.deep_thing
  let levels = 0
  while (cursor && cursor.nested_level !== undefined) {
    cursor = cursor.nested_level
    levels += 1
  }
  assert.ok(levels > 0 && levels < 100, `expected a bounded walk, got ${levels}`)
  assert.equal(cursor, null, 'the over-depth remainder is dropped, never left in producer vocabulary')
})

test('drops malformed members of the restored link fields', () => {
  const node = normalizeNode<Record<string, any>>({
    '@id': 'https://www.ammitto.org/entry/cn/l/1',
    legalCitations: [null, 'str', 7, { legalInstrumentId: 'https://i/1' }],
    groupId: 42,
  })!
  assert.deepEqual(node.legal_citations, [{ legal_instrument_id: 'https://i/1' }])
  assert.equal('group_id' in node, false, 'a non-string group reference must not reach the URL builder')
})

test('drops wrong-typed citation fields the views call methods on', () => {
  const node = normalizeNode<Record<string, any>>({
    '@id': 'https://www.ammitto.org/entry/cn/l/1',
    // AnnouncementPage calls .replace on legal_instrument_id and
    // citation_type, and .join on articles
    legalCitations: [{ legalInstrumentId: 42, articles: 'Article 4', citationType: 7, context: 'kept' }],
  })!
  const citation = node.legal_citations[0]
  assert.equal('legal_instrument_id' in citation, false)
  assert.equal('articles' in citation, false)
  assert.equal('citation_type' in citation, false)
  assert.equal(citation.context, 'kept', 'fields no consumer dereferences are left alone')
})

test('drops a citation left with nothing but its identity', () => {
  const node = normalizeNode<Record<string, any>>({
    '@id': 'https://www.ammitto.org/entry/cn/l/1',
    legalCitations: [
      { '@type': 'LegalCitation', legalInstrumentId: 42 },
      // identity only: convert() synthesises `id` from `@id`, which must not
      // count as data
      { '@id': 'https://www.ammitto.org/citation/cn/1', '@type': 'LegalCitation' },
      { legalInstrumentId: 'https://i/1' },
    ],
  })!
  assert.deepEqual(node.legal_citations, [{ legal_instrument_id: 'https://i/1' }])
})

test('validates entry references by the producer segment count', () => {
  const ok = 'https://www.ammitto.org/entry/eu/consolidated-list/eu1'
  assert.equal(toNodeIri(ok, 'entry'), ok)
  for (const bad of [
    'https://www.ammitto.org/entry/eu',
    'https://www.ammitto.org/entry/eu/list',
    'https://www.ammitto.org/entry/eu/list/id/extra',
    'https://www.ammitto.org/entry/eu/list/%2e%2e',
    'https://www.ammitto.org/entry/eu\\..\\..\\entity\\eu\\x',
    'https://www.ammitto.org/entry//list/id',
    'https://www.ammitto.org/entry/eu/./id',
    'https://evil.example/entry/eu/list/id',
  ]) {
    assert.equal(toNodeIri(bad, 'entry'), null, `expected ${bad} to be rejected`)
  }
})

test('drops articles when any member is not a string', () => {
  const node = normalizeNode<Record<string, any>>({
    '@id': 'https://www.ammitto.org/entry/cn/l/1',
    legalCitations: [{ legalInstrumentId: 'https://i/1', articles: ['ok', null] }],
  })!
  assert.equal('articles' in node.legal_citations[0], false)
})

test('keeps a well-formed group reference and rejects an unroutable one', () => {
  const node = normalizeNode<Record<string, any>>({
    '@id': 'https://www.ammitto.org/entry/cn/l/1',
    groupId: ' https://www.ammitto.org/group/cn/2026-1 ',
  })!
  assert.equal(node.group_id, 'https://www.ammitto.org/group/cn/2026-1')

  for (const bad of [
    'https://evil.example/group/cn/1',
    'https://www.ammitto.org.evil.com/group/cn/1',
    'https://www.ammitto.org/groupX/cn/1',
    'https://www.ammitto.org/group//cn/1',
    'https://www.ammitto.org/group/cn/1?a=1',
    'https://www.ammitto.org/group/cn/1#f',
    'https://www.ammitto.org/group/cn/..%2F1',
    'https://www.ammitto.org/group/../x',
    'https://www.ammitto.org/group/cn/1/',
    'https://www.ammitto.org/group/cn',
    'https://www.ammitto.org/group/cn/1/extra',
    'https://www.ammitto.org/group/cn\\..\\..\\entity\\cn\\x',
    'https://www.ammitto.org/group/cn/.',
    'https://www.ammitto.org/entity/cn/1',
  ]) {
    const n = normalizeNode<Record<string, any>>({ '@id': 'x', groupId: bad })!
    assert.equal('group_id' in n, false, `expected ${bad} to be rejected`)
  }
})

test('deduplicates padded variants of one entry reference', () => {
  const node = normalizeNode<Record<string, any>>({
    '@id': ENTITY,
    hasSanctionEntry: [` ${ENTRY} `, ENTRY, { '@id': ENTRY }],
  })!
  assert.deepEqual(node.sanction_entry_ids, [ENTRY])
})

test('normalizeGraph skips non-object members and tolerates a non-array', () => {
  assert.deepEqual(normalizeGraph('nope'), [])
  assert.equal(normalizeGraph([{ '@id': 'a' }, null, 'str', 7, { '@id': 'b' }]).length, 2)
})
