/**
 * The legal instrument a listing names as its authority, as the entity page
 * renders it.
 *
 * A sanction entry publishes `legalBases`: the instrument under which that
 * authority made the listing. The serializer emits it inline, with a title
 * and a url (`json_ld_serializer.rb#serialize_legal_bases`), but the graph
 * exporter then replaces every member with a bare node reference
 * (`json_ld_graph_exporter.rb#extract_instruments`) and moves the metadata
 * into a separate instrument node. So what actually reaches a consumer is
 * an `@id` and nothing else — no title, no identifier, no url. Anything a
 * reader can recognise has to come from the instrument's own node.
 *
 * Two vocabularies meet in this one feature and neither is negotiable.
 * Entry nodes go through `normalizeNode`, so the field is read as
 * `legal_bases`; instrument nodes do not — `LegalInstrumentPage` and
 * `BrowseLegalInstrumentsPage` both read them in the producer's camelCase —
 * so their fields are read as `title`, `name`, `identifier`.
 *
 * Everything here is pure: no `vue`, no `fetch`, no aliases. The unit tests
 * run the emitted JavaScript on plain Node, which resolves ESM specifiers
 * literally and has neither Vite nor its path aliases.
 */
// Spelled with the '.js' extension the emitted JavaScript needs: this
// module has an import, and `npm run test:unit` runs the tsc output on
// plain Node. TypeScript and Vite both map it back to the .ts source.
import { toNodeIri } from './normalizeNode.js'

/**
 * The subset of a normalized entry node these adapters read.
 *
 * `legal_bases`, not `legalBases`: the producer publishes the camelCase
 * term and `normalizeNode` renames it at the fetch boundary, verified by
 * running the emitted module over a live entry node. The camelCase
 * spelling never reaches a consumer, so accepting it here would only make
 * a broken normalization look like it still worked.
 */
export interface LegalBasisBearingEntry {
  legal_bases?: unknown
}

/**
 * An instrument node as the site reads it, in the producer's own spelling.
 *
 * `title` carries either a plain string or an array of one-key localized
 * objects — both shapes are live: every instrument a `legalBases` member
 * points at today states a string, while the instruments reached through
 * `legalCitations` state the array. `name` is the producer's already-
 * resolved English title, present only on the latter.
 */
export interface LegalInstrumentNode {
  title?: Array<{ [lang: string]: string | undefined }> | string
  name?: string
  identifier?: string
}

/** One legal basis, as the entity page renders it. */
export interface LegalBasisRow {
  /** The instrument IRI: the `v-for` key, and what the entry published. */
  id: string
  /** What the reader sees. */
  label: string
  /** The instrument page's route, or null when its node did not resolve. */
  route: string | null
}

/** Base every published instrument IRI carries (the gem's BASE_URI). */
const INSTRUMENT_IRI_BASE = 'https://www.ammitto.org/legal-instrument/'

/**
 * The IRI a `legalBases` member carries.
 *
 * Members arrive as node references: `{ '@id': ... }` from the producer,
 * `{ '@id': ..., id: ... }` once `normalizeNode` has synthesised its `id`.
 * A bare IRI string is accepted too, because the context declares the term
 * `{'@type': '@id'}`, under which a producer may write one.
 */
function basisIri(member: unknown): unknown {
  if (typeof member === 'string') return member
  if (typeof member === 'object' && member !== null) {
    return (member as Record<string, unknown>)['@id']
  }
  return undefined
}

/**
 * The instrument IRIs an entity's listings name, in publication order and
 * deduplicated.
 *
 * Every IRI goes through `toNodeIri` before it is returned, so the tail
 * that later becomes a fetch path and a route is known to be exactly the
 * two plain segments the producer writes. An unrecognised reference is
 * dropped rather than turned into a request for a page that cannot exist.
 */
export function legalBasisIris(
  entries: LegalBasisBearingEntry[] | null | undefined,
): string[] {
  if (!Array.isArray(entries)) return []

  const iris: string[] = []
  const seen = new Set<string>()
  for (const entry of entries) {
    const bases = entry?.legal_bases
    if (!Array.isArray(bases)) continue
    for (const member of bases) {
      const iri = toNodeIri(basisIri(member), 'legal-instrument')
      if (!iri || seen.has(iri)) continue
      seen.add(iri)
      iris.push(iri)
    }
  }
  return iris
}

/** Tail of a validated instrument IRI: `{source}/{localId}`. */
function instrumentRef(iri: string): string {
  return iri.slice(INSTRUMENT_IRI_BASE.length)
}

/**
 * Where an instrument's node document lives, relative to the deployment
 * base — the same shape as the entry path beside it in `useEntityData`,
 * which prefixes `import.meta.env.BASE_URL` so the site also works when it
 * is served from a repository subpath.
 */
export function legalInstrumentNodeUrl(iri: string): string {
  return `api/v1/node/legal-instrument/${instrumentRef(iri)}.jsonld`
}

/** The instrument page's route, matching `/legal-instrument/:id(.*)`. */
export function legalInstrumentRoute(iri: string): string {
  return `/legal-instrument/${instrumentRef(iri)}`
}

/** A stated string, or null. */
function stated(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/**
 * What to call an instrument, or null when its node states no name at all.
 *
 * English first, then whatever other language the array happens to carry,
 * then the producer's resolved `name`, then the bare `identifier`. The
 * "any other language" step is wider than the en/zh-Hans pair the two
 * existing instrument readers use: the array holds the languages a source
 * publishes in, and a source publishing in neither of those two would
 * otherwise render as an untitled row while its title sat in the node.
 */
export function legalInstrumentTitle(node: unknown): string | null {
  if (typeof node !== 'object' || node === null) return null
  const instrument = node as LegalInstrumentNode

  const title = instrument.title
  if (typeof title === 'string') {
    const text = stated(title)
    if (text) return text
  } else if (Array.isArray(title)) {
    const english = title
      .map((entry) => (typeof entry === 'object' && entry !== null ? stated(entry.en) : null))
      .find((text) => text !== null)
    if (english) return english

    for (const entry of title) {
      if (typeof entry !== 'object' || entry === null) continue
      for (const value of Object.values(entry)) {
        const text = stated(value)
        if (text) return text
      }
    }
  }

  return stated(instrument.name) ?? stated(instrument.identifier)
}

/**
 * The rows the page renders, given the IRIs its listings named and the
 * instrument nodes that were successfully fetched.
 *
 * A key present in `resolved` means that instrument's node document came
 * back: the fetch IS the existence check, and it is the only one available
 * — the published instrument index carries `@id` and nothing else, so it
 * can neither name an instrument nor prove one is missing. A reference
 * whose node did not come back therefore renders as plain text, because a
 * link that 404s tells a reader less than a label that does not pretend to
 * lead anywhere.
 *
 * The label falls back to the IRI's own local id rather than to a
 * prettified version of it. The slug is what the URL says and what the
 * producer stored; title-casing it would invent a name for a legal
 * instrument, and a law named wrongly is worse than a law named tersely.
 */
export function legalBasisRows(
  iris: readonly string[],
  resolved: ReadonlyMap<string, LegalInstrumentNode>,
): LegalBasisRow[] {
  return iris.map((iri) => {
    const node = resolved.get(iri)
    const segments = instrumentRef(iri).split('/')
    return {
      id: iri,
      label: legalInstrumentTitle(node) ?? segments[segments.length - 1] ?? iri,
      route: resolved.has(iri) ? legalInstrumentRoute(iri) : null,
    }
  })
}
