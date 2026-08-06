/**
 * Normalize a producer node (entity or sanction entry) into the shape the
 * site's own interfaces read.
 *
 * The gem publishes entity and entry nodes in JSON-LD: `@id`/`@type`
 * keywords and lowerCamelCase property names, which is what its context
 * (`api/v1/context.jsonld`), its generated ontology
 * (`api/v1/ontology/properties.jsonld`), its Turtle rendering and this
 * repo's own `public/schemas/context.jsonld` all declare. The site's
 * runtime interfaces were written against the older snake_case snapshot.
 * Rather than rename ~230 field reads across 11 files, the two vocabularies
 * meet here, at the fetch boundary, in one testable place.
 *
 * Only entity and entry nodes go through this. Group nodes are already
 * snake_case, and organization / document-type / legal-instrument / index
 * nodes are already read as camelCase — passing those through would be a
 * regression, so callers apply it deliberately rather than globally.
 *
 * The conversion is idempotent: snake_case input passes through unchanged,
 * so a page still renders correctly against an older published snapshot.
 */

/** Values whose own keys are source-supplied data, not vocabulary. */
const OPAQUE_VALUE_KEYS = new Set([
  'sourceSpecificFields',
  'source_specific_fields',
])

/**
 * Producer terms that differ from the site's field names by more than case.
 * Everything else is handled by the mechanical camelCase -> snake_case rule,
 * so a term the gem adds later needs no entry here.
 *
 * A Map, not an object literal: a node carrying a `__proto__`, `constructor`
 * or `toString` key would otherwise look up an inherited value and rename
 * the field to something like "[object Object]".
 */
const RENAMED_KEYS = new Map([
  // Entity -> entry edge. The gem emits the term its context and ontology
  // declare; the site has always called the array sanction_entry_ids.
  ['hasSanctionEntry', 'sanction_entry_ids'],
  // EntityLink members (linkedEntities[], beneficialOwners[]).
  ['targetId', 'entity_id'],
  ['relationship', 'relationship_type'],
])

/**
 * countryIsoCode is read as country_code inside addresses, birth info and
 * identifications, but as country_iso_code at an organization root. Both
 * spellings are emitted so neither reader needs to know which node it is
 * looking at.
 */
const COUNTRY_ISO_ALIASES = ['country_code', 'country_iso_code']

const CAMEL_BOUNDARY = /([a-z0-9])([A-Z])/g

/** `entityType` -> `entity_type`; already-snake_case input is unchanged. */
function toSnakeCase(key: string): string {
  return key.replace(CAMEL_BOUNDARY, '$1_$2').toLowerCase()
}

/**
 * Assign without going through the `__proto__` setter, so a node carrying a
 * `__proto__` key produces a plain own property instead of mutating
 * Object.prototype.
 */
function assign(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  })
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Entry IRIs, tolerating a producer that emits one string, a set of strings,
 * or `{ '@id': ... }` node references — all three are legal under the
 * context's `hasSanctionEntry: { '@type': '@id', '@container': '@set' }`.
 * Values are trimmed and blanks dropped, because the consumer turns each
 * element straight into a fetch path.
 */
function toIriList(value: unknown): string[] {
  const items = Array.isArray(value) ? value : [value]
  const iris = items.flatMap((item) => {
    const iri = typeof item === 'string'
      ? item
      : isPlainObject(item) && typeof item['@id'] === 'string'
        ? (item['@id'] as string)
        : null
    if (iri === null) return []
    const trimmed = iri.trim()
    return trimmed ? [trimmed] : []
  })
  return [...new Set(iris)]
}

/** Base every published node IRI carries (the gem's BASE_URI). */
const NODE_IRI_BASE = 'https://www.ammitto.org/'

/**
 * Number of path segments each published node kind carries after its base:
 * entity/{source}/{id}, entry/{source}/{list}/{id}, group/{source}/{id}.
 */
const NODE_IRI_SEGMENTS: Record<string, number> = {
  entity: 2,
  entry: 3,
  group: 2,
}

/**
 * A node IRI of the given kind, or null. Views build routes and fetch paths
 * by stripping this base off the IRI, so the tail must be exactly the
 * segment count the producer writes, each segment plain and non-empty:
 * another host, an empty segment, a percent escape, a backslash, a query, a
 * fragment or a "."/".." segment all name a page that cannot exist. Kept in
 * step with the deploy workflow's node_iri jq helper.
 */
export function toNodeIri(value: unknown, kind: string): string | null {
  if (typeof value !== 'string') return null
  const iri = value.trim()
  const prefix = `${NODE_IRI_BASE}${kind}/`
  if (!iri.startsWith(prefix)) return null

  const segments = iri.slice(prefix.length).split('/')
  const expected = NODE_IRI_SEGMENTS[kind]
  if (expected !== undefined && segments.length !== expected) return null
  return segments.every((s) => s.length > 0 && !/[?#%\\\s]/.test(s) && s !== '.' && s !== '..')
    ? iri
    : null
}

/**
 * Legal citations, keeping only members whose fields have the types the
 * views actually call methods on.
 */
function toCitationList(value: unknown, depth: number): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((member) => {
    if (!isPlainObject(member)) return []
    const converted = convert(member, depth + 1)
    if (!isPlainObject(converted)) return []

    const citation: Record<string, unknown> = { ...converted }
    if (typeof citation.legal_instrument_id !== 'string') delete citation.legal_instrument_id
    if (typeof citation.citation_type !== 'string') delete citation.citation_type
    if (!Array.isArray(citation.articles) || citation.articles.some((a) => typeof a !== 'string')) {
      delete citation.articles
    }

    // A citation left with nothing but its identity would still render as
    // an "Unknown Legal Instrument" row. `id` is excluded because convert()
    // synthesises it from `@id`, so an identity-only citation would
    // otherwise look like it carries data.
    const dataKeys = Object.keys(citation).filter((k) => !k.startsWith('@') && k !== 'id')
    return dataKeys.length > 0 ? [citation] : []
  })
}

/**
 * Whether a key is in the producer's own vocabulary rather than a legacy
 * snake_case spelling. Keys are processed legacy-first so that when a node
 * carries both (`entityType` and `entity_type`), the producer's spelling
 * wins deterministically instead of whichever happened to be last.
 */
function isCanonicalKey(key: string): boolean {
  return key.startsWith('@') || key !== toSnakeCase(key) || RENAMED_KEYS.has(key)
}

/**
 * Guard against a pathologically nested node exhausting the call stack: one
 * bad record would otherwise make loadSourceEntities discard the whole
 * source. Real nodes are under ten levels deep, so anything past the cap is
 * dropped rather than passed through — a half-converted subtree would hand
 * a consumer producer-vocabulary keys it does not read, which looks like
 * missing data instead of an obvious hole.
 */
const MAX_DEPTH = 64

function convert(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return null
  if (Array.isArray(value)) return value.map((item) => convert(item, depth + 1))
  if (!isPlainObject(value)) return value

  const out: Record<string, unknown> = {}
  const entries = Object.entries(value)
    .sort((a, b) => Number(isCanonicalKey(a[0])) - Number(isCanonicalKey(b[0])))

  for (const [key, raw] of entries) {
    // JSON-LD keywords stay: authority, regime and legalBases[] members are
    // read as { '@id': ... } node references and must survive intact.
    if (key.startsWith('@')) {
      assign(out, key, convert(raw, depth + 1))
      continue
    }

    // Prefixed source keys (au:reference) are data, not vocabulary.
    if (key.includes(':')) {
      assign(out, key, raw)
      continue
    }

    if (OPAQUE_VALUE_KEYS.has(key)) {
      assign(out, toSnakeCase(key), raw)
      continue
    }

    if (key === 'hasSanctionEntry' || key === 'sanction_entry_ids') {
      assign(out, 'sanction_entry_ids', toIriList(raw))
      continue
    }

    // The restored link fields are the ones this change newly puts in
    // front of consumers, so they are the ones worth shaping here. Views
    // call .replace and .join on citation members and interpolate group_id
    // into a route, so a wrong-typed field would surface as a whole error
    // page rather than one blank row.
    if (key === 'legalCitations' || key === 'legal_citations') {
      assign(out, 'legal_citations', toCitationList(raw, depth))
      continue
    }

    if (key === 'groupId' || key === 'group_id') {
      const groupIri = toNodeIri(raw, 'group')
      if (groupIri) assign(out, 'group_id', groupIri)
      continue
    }

    if (key === 'countryIsoCode' || key === 'country_iso_code' || key === 'country_code') {
      const converted = convert(raw, depth + 1)
      for (const alias of COUNTRY_ISO_ALIASES) assign(out, alias, converted)
      continue
    }

    assign(out, RENAMED_KEYS.get(key) ?? toSnakeCase(key), convert(raw, depth + 1))
  }

  // The site reads a bare `id`; the producer's identifier keyword is `@id`,
  // which stays so nested node references keep working. `@id` wins over a
  // data property also spelled `id` (serialize_authority emits one), so a
  // node carrying both still identifies by its IRI. An older snapshot with
  // only `id` is untouched.
  const iri = value['@id']
  if (typeof iri === 'string' && iri.trim()) {
    assign(out, 'id', iri)
  }

  return out
}

/**
 * Normalize one entity or entry node.
 * @param node parsed JSON from an entity/entry node file or aggregate graph
 * @returns the node in the site's field vocabulary, or null for non-objects
 */
export function normalizeNode<T = Record<string, unknown>>(node: unknown): T | null {
  if (!isPlainObject(node)) return null
  return convert(node) as T
}

/**
 * Normalize every node of a per-source aggregate `@graph`, which holds only
 * entity and entry nodes.
 * @param nodes the parsed `@graph` array
 */
export function normalizeGraph<T = Record<string, unknown>>(nodes: unknown): T[] {
  if (!Array.isArray(nodes)) return []
  return nodes.map((node) => normalizeNode<T>(node)).filter((node): node is T => node !== null)
}
