/**
 * The legal basis a listing names, and how the entity page renders it.
 *
 * This is a cross-repo contract as much as a formatter. The gem publishes
 * `legalBases` on a sanction entry and then, in the graph exporter,
 * replaces every member with a bare `{ '@id': ... }` reference — so the
 * site's only handle on the law behind a listing is an IRI, and the
 * spellings below are a contract between two repositories that ship
 * separately. The producer side is
 * `lib/ammitto/serialization/json_ld_serializer.rb#serialize_legal_bases`
 * and `json_ld_graph_exporter.rb#extract_instruments`.
 *
 * The fixtures are live nodes, copied verbatim from
 * `https://ammitto.org/api/v1/` rather than invented, because the whole
 * point of the field is what the producer actually emits.
 *
 * Plain JavaScript against the emitted module, for the reason spelled out
 * at the top of normalizeNode.test.js: Node 20 cannot import `.ts`
 * directly.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  legalBasisIris,
  legalBasisRows,
  legalInstrumentNodeUrl,
  legalInstrumentRoute,
  legalInstrumentTitle,
} from '../.test-build/utils/legalBasisAdapters.js'
import { normalizeNode } from '../.test-build/utils/normalizeNode.js'

const TALIBAN_IRI =
  'https://www.ammitto.org/legal-instrument/au/charter-of-the-united-nations-sanctions-the-taliban-regulation-2013'
const EU_IRI = 'https://www.ammitto.org/legal-instrument/eu/2022-1529-oj-l239'

/** `api/v1/node/entry/au/consolidated-list/100.jsonld`, trimmed. */
const AU_ENTRY_NODE = {
  '@id': 'https://www.ammitto.org/entry/au/consolidated-list/100',
  '@type': 'SanctionEntry',
  entityId: 'https://www.ammitto.org/entity/au/100',
  legalBases: [{ '@id': TALIBAN_IRI }],
  status: 'active',
}

/** `api/v1/node/legal-instrument/eu/2022-1529-oj-l239.jsonld`. */
const EU_INSTRUMENT = {
  '@id': EU_IRI,
  '@type': 'LegalInstrument',
  type: 'amendment',
  identifier: '2022/1529 (OJ L239)',
  title: '2022/1529 (OJ L239)',
  issuingBody: 'Council',
  url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:32022R1529',
}

test('reads the field name normalizeNode leaves on an entry node', () => {
  // The producer writes `legalBases`; the site reads `legal_bases`. If
  // either side respells it, the page silently shows no legal basis at
  // all — so the conversion is asserted end to end on a real node rather
  // than assumed.
  const entry = normalizeNode(AU_ENTRY_NODE)
  assert.equal('legalBases' in entry, false)
  assert.deepEqual(legalBasisIris([entry]), [TALIBAN_IRI])
})

test('accepts every member shape the context allows', () => {
  // `{'@id': ...}` from the producer, the same object once normalizeNode
  // has synthesised its `id`, and a bare IRI — legal under the context's
  // `{'@type': '@id'}` declaration.
  assert.deepEqual(legalBasisIris([{ legal_bases: [{ '@id': EU_IRI }] }]), [EU_IRI])
  assert.deepEqual(legalBasisIris([{ legal_bases: [{ '@id': EU_IRI, id: EU_IRI }] }]), [EU_IRI])
  assert.deepEqual(legalBasisIris([{ legal_bases: [EU_IRI] }]), [EU_IRI])
})

test('names one instrument once however many listings cite it', () => {
  // Entries carry exactly one basis today, but nothing in the model says
  // an entity's several listings cannot name the same law, and resolving
  // it twice would cost a second request for an answer already held.
  const iris = legalBasisIris([
    { legal_bases: [{ '@id': EU_IRI }] },
    { legal_bases: [{ '@id': TALIBAN_IRI }, { '@id': EU_IRI }] },
  ])
  assert.deepEqual(iris, [EU_IRI, TALIBAN_IRI])
})

test('drops a reference that cannot name a page', () => {
  // The tail becomes a fetch path and a route verbatim, so anything but
  // the two plain segments the producer writes is discarded rather than
  // requested: another host, a traversal, an escape, the wrong depth.
  const rejected = [
    'https://example.com/legal-instrument/eu/2022-1529-oj-l239',
    'https://www.ammitto.org/legal-instrument/eu/..',
    'https://www.ammitto.org/legal-instrument/eu/2022%2F1529',
    'https://www.ammitto.org/legal-instrument/eu/2022?x=1',
    'https://www.ammitto.org/legal-instrument/eu',
    'https://www.ammitto.org/legal-instrument/eu/2022/1529',
    'https://www.ammitto.org/entry/au/consolidated-list/100',
    '',
    42,
    null,
  ]
  for (const value of rejected) {
    assert.deepEqual(
      legalBasisIris([{ legal_bases: [value] }]),
      [],
      `${JSON.stringify(value)} must not become a fetch path`,
    )
  }
})

test('treats an absent or malformed field as no legal basis', () => {
  assert.deepEqual(legalBasisIris(null), [])
  assert.deepEqual(legalBasisIris(undefined), [])
  assert.deepEqual(legalBasisIris([{}]), [])
  assert.deepEqual(legalBasisIris([{ legal_bases: null }]), [])
  assert.deepEqual(legalBasisIris([{ legal_bases: 'not-a-list' }]), [])
})

test('requests exactly the published node path and route', () => {
  assert.equal(
    legalInstrumentNodeUrl(EU_IRI),
    'api/v1/node/legal-instrument/eu/2022-1529-oj-l239.jsonld',
  )
  // Relative, so `useEntityData` can prefix the deployment base the way it
  // does for entry nodes; the route is absolute because the router is.
  assert.equal(legalInstrumentNodeUrl(EU_IRI).startsWith('/'), false)
  assert.equal(legalInstrumentRoute(EU_IRI), '/legal-instrument/eu/2022-1529-oj-l239')
})

test('names an instrument from the shape its node actually carries', () => {
  // A plain string, which is what every instrument reachable from a
  // legalBases reference states today.
  assert.equal(legalInstrumentTitle(EU_INSTRUMENT), '2022/1529 (OJ L239)')

  // The localized array, which is what the instruments reached through
  // legalCitations state. English wins.
  assert.equal(
    legalInstrumentTitle({
      title: [
        { 'zh-Hans': '中华人民共和国出口管制法' },
        { en: 'Export Control Law of the People’s Republic of China' },
      ],
      name: 'Export Control Law of the People’s Republic of China',
    }),
    'Export Control Law of the People’s Republic of China',
  )

  // No English: any stated language beats rendering an untitled row.
  assert.equal(
    legalInstrumentTitle({ title: [{ 'zh-Hans': '中华人民共和国出口管制法' }] }),
    '中华人民共和国出口管制法',
  )

  // Then the producer's resolved name, then the bare identifier.
  assert.equal(legalInstrumentTitle({ name: 'Export Control Law' }), 'Export Control Law')
  assert.equal(legalInstrumentTitle({ identifier: '2013-03-07' }), '2013-03-07')

  // Nothing stated is null, not an empty string that would render as a
  // link with no text in it.
  assert.equal(legalInstrumentTitle({ title: '   ', name: '', identifier: null }), null)
  assert.equal(legalInstrumentTitle(null), null)
  assert.equal(legalInstrumentTitle('a string'), null)
})

test('links a basis to the instrument page, under the instrument its own name', () => {
  const rows = legalBasisRows([EU_IRI], new Map([[EU_IRI, EU_INSTRUMENT]]))
  assert.deepEqual(rows, [
    {
      id: EU_IRI,
      label: '2022/1529 (OJ L239)',
      route: '/legal-instrument/eu/2022-1529-oj-l239',
    },
  ])
})

test('an unresolved instrument is a label, never a link', () => {
  // Absence from the map means the node did not come back, which is the
  // only evidence available that the instrument is not published: the
  // index carries `@id` and nothing else. A link that 404s tells a reader
  // less than a label that does not pretend to lead anywhere.
  const rows = legalBasisRows([TALIBAN_IRI], new Map())
  assert.equal(rows.length, 1)
  assert.equal(rows[0].route, null)
  // The IRI's own local id, verbatim. Title-casing the slug would invent a
  // name for a law.
  assert.equal(rows[0].label, 'charter-of-the-united-nations-sanctions-the-taliban-regulation-2013')
})

test('a resolved instrument that states no name still links', () => {
  // The node exists, so the page exists; only the label falls back.
  const rows = legalBasisRows([EU_IRI], new Map([[EU_IRI, {}]]))
  assert.deepEqual(rows, [
    {
      id: EU_IRI,
      label: '2022-1529-oj-l239',
      route: '/legal-instrument/eu/2022-1529-oj-l239',
    },
  ])
})

test('keeps the listings’ order and answers with a row per reference', () => {
  const rows = legalBasisRows(
    [EU_IRI, TALIBAN_IRI],
    new Map([[TALIBAN_IRI, { title: 'Charter of the United Nations Regulation 2013' }]]),
  )
  assert.deepEqual(
    rows.map((row) => [row.id, row.route === null]),
    [
      [EU_IRI, true],
      [TALIBAN_IRI, false],
    ],
  )
})
