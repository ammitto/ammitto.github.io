/**
 * The reads that no published node can answer must stay gone, and the
 * fetch guard must stay wired.
 *
 * `sourceCatalog.test.js` proves the catalogue is right. It cannot prove
 * that `useSanctionsData` still CONSULTS it: restoring the inline list and
 * the unconditional fetch leaves every catalogue assertion green. That is
 * the same gap `birthWiring.test.js` exists to close, and this file closes
 * it the same way.
 *
 * The second half is different in kind. Two fields were removed because
 * the producer emits them nowhere and declares them nowhere — measured
 * against every node published under `api/v1/sources/`, and confirmed
 * against the gem's harmonized models, which have no such attribute under
 * any spelling. Nothing fails when markup for them reappears: it simply
 * never renders, which is exactly why a test has to say so. Restoring
 * either one is a decision to make deliberately, after the producer starts
 * emitting it, not something to slip back in while refactoring.
 *
 * These are SUBSTRING AND PATTERN CHECKS OVER SOURCE TEXT — they verify
 * what is written, not what evaluates, for the reason set out at the top
 * of birthWiring.test.js. The forbidden patterns match code shapes rather
 * than bare words, so prose in a comment cannot trip them.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => readFileSync(join(repoRoot, relative), 'utf8')

/** Collapse whitespace so a reformat does not fail the contract. */
const flatten = (source) => source.replace(/\s+/g, ' ')

test('useSanctionsData asks the catalogue before fetching a source', () => {
  const source = read('src/composables/useSanctionsData.ts')

  // Either quote style: the contract is that the module is imported, and a
  // formatter normalising quotes does not undo it.
  assert.match(
    source,
    /^\s*import\s+\{[^}]*\}\s+from\s+['"]@\/utils\/sourceCatalog['"]/m,
    "useSanctionsData must import from '@/utils/sourceCatalog'",
  )

  assert.ok(
    flatten(source).includes(flatten('if (!publishesAggregate(source)) {')),
    'loadSourceEntities must skip a source with no aggregate published',
  )
})

test('useSanctionsData does not keep its own copy of the source list', () => {
  // An inline list is how the two guaranteed 404s got there: a second
  // place to state which sources exist, with nothing keeping it honest
  // about which of them are served.
  const source = read('src/composables/useSanctionsData.ts')

  assert.equal(
    /'un_vessels'|"un_vessels"/.test(source),
    false,
    'the source list belongs in sourceCatalog.ts, not inline here',
  )
  assert.ok(
    flatten(source).includes('ALL_SOURCES'),
    'useSanctionsData must still iterate the whole catalogue',
  )
})

test('the catalogue is compiled for the unit tests', () => {
  // A module absent from this list emits nothing, and its test then fails
  // with "module not found" — which reads as a broken import rather than
  // the missing coverage it actually is.
  assert.ok(
    read('tsconfig.test.json').includes('sourceCatalog.ts'),
    'tsconfig.test.json must include src/utils/sourceCatalog.ts',
  )
})

/**
 * The removed reads, and every file that used to carry one.
 *
 * `\bcontact\b` cannot match inside `contact_info` or `contactInfo`,
 * because `_` and `I` are both word characters — which matters, since
 * `contact_info` is deliberately still declared: the gem's PersonEntity
 * and OrganizationEntity really do have that attribute, it is simply
 * unpopulated so far, and nothing renders it.
 */
const REMOVED_READS = [
  {
    file: 'src/composables/useEntityData.ts',
    forbidden: [
      { name: 'a citizenship field', pattern: /citizenships/ },
      { name: 'a contact declaration', pattern: /\bcontact\s*\?\s*:\s*string/ },
      { name: 'a contact read', pattern: /entity\.value\s*\??\.\s*contact\b/ },
    ],
  },
  {
    file: 'src/composables/useSanctionsData.ts',
    forbidden: [
      { name: 'a citizenship field', pattern: /citizenships/ },
      { name: 'a contact declaration', pattern: /\bcontact\s*\?\s*:\s*string/ },
      { name: 'a contact read', pattern: /\bentity\.contact\b/ },
    ],
  },
  {
    file: 'src/views/EntityPage.vue',
    forbidden: [
      { name: 'a citizenship field', pattern: /citizenships/ },
      { name: 'a contact section guard', pattern: /v-if="contact"/ },
      { name: 'a contact interpolation', pattern: /\{\{\s*contact\s*\}\}/ },
      { name: 'a contact binding', pattern: /^\s*contact,\s*$/m },
    ],
  },
  {
    file: 'src/views/SchemaPage.vue',
    forbidden: [
      // The schema page is the site telling API consumers what a node
      // carries. Documenting a field the producer never emits is the
      // same untruth as rendering it, and the more visible one.
      { name: 'a documented contact field', pattern: /"contact"/ },
      { name: 'a contact field listing', pattern: /remarks,\s*contact/ },
    ],
  },
]

for (const { file, forbidden } of REMOVED_READS) {
  test(`${file} does not read a field the producer never emits`, () => {
    const source = read(file)
    for (const { name, pattern } of forbidden) {
      assert.equal(
        pattern.test(source),
        false,
        `${file} carries ${name}; no published node answers it`,
      )
    }
  })
}

/** Match an interpolated value literally, whatever characters a type name gains. */
const literal = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The per-type table on the schema page, read one entry at a time.
 *
 * A substring ban cannot express this contract. `OrganizationEntity` and
 * `AircraftEntity` carried byte-identical field strings, so a pattern that
 * rejected the aircraft one rejected the organization one with it — and
 * `addresses` is genuinely an organization field. The entry has to be
 * located by its type before its fields are judged.
 *
 * Either quote style is accepted on both halves, because the contract is
 * which fields an entry lists and a formatter normalising quotes does not
 * change that. The tempered `(?!\btype:)` is what makes that safe rather
 * than merely lenient. The scan from a type to its fields is lazy, so if one
 * entry's `fields:` fails to match, the scan does not stop — it runs on into
 * the NEXT entry and returns that entry's fields instead, and the assertion
 * then judges the wrong type and can pass while the regression it guards is
 * present. Refusing to cross a `type:` key turns that silent misread back
 * into the loud no-match below. It is proved, not assumed: the suite
 * reformats one entry's quotes with the regression restored, and this file
 * still fails.
 */
const fieldsFor = (source, type) => {
  const match = source.match(
    new RegExp(
      `type:\\s*['"]${literal(type)}['"]\\s*,` +
        `(?:(?!\\btype:)[\\s\\S])*?` +
        `\\bfields:\\s*(?:'([^']*)'|"([^"]*)")`,
    ),
  )
  // A rename that breaks the extractor must fail here rather than sail
  // through as a vacuous pass: no match means the contract went unchecked.
  assert.ok(match, `no ${type} entry found in the schema page's type table`)
  return match[1] ?? match[2]
}

/**
 * Which entity types declare `addresses`, per the gem's harmonized models.
 *
 * PersonEntity and OrganizationEntity declare the attribute and populate
 * it. VesselEntity and AircraftEntity declare nothing of the kind, and
 * neither does the Entity base class they both extend, so no node of
 * either type can ever carry the key — this is the `contact` case above,
 * not the `contact_info` one.
 */
const ADDRESS_BEARING = {
  PersonEntity: true,
  OrganizationEntity: true,
  VesselEntity: false,
  AircraftEntity: false,
}

for (const [type, declaresAddresses] of Object.entries(ADDRESS_BEARING)) {
  test(`the schema page ${declaresAddresses ? 'documents' : 'does not document'} addresses on ${type}`, () => {
    const fields = fieldsFor(read('src/views/SchemaPage.vue'), type)

    assert.equal(
      /\baddresses\b/.test(fields),
      declaresAddresses,
      declaresAddresses
        ? `${type} declares addresses and the table must say so`
        : `${type} carries no addresses attribute; documenting one tells API consumers to read a key no node has`,
    )
  })
}

test('contact_info stays declared, because the producer declares it', () => {
  // The counterpart to the bans above, and the reason they are written as
  // shapes rather than as a ban on the word. Deleting this too would lose
  // the record that the field exists in the gem's model and is simply
  // unpopulated.
  assert.match(
    read('src/composables/useEntityData.ts'),
    /contact_info\s*\?\s*:/,
    'contact_info is a real producer attribute and stays described here',
  )
})
