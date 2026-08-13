/**
 * The single-value facts the entity page states about its subject.
 *
 * Birth claims, identifications and listing periods each have their own
 * module; what is left are three fields the producer has always published
 * and no page has ever read — the person's gender and title, and the
 * vessel's IMO number. A reader screening a subject was being shown less
 * than the API served them, and in the title's case was being shown an
 * empty section under a heading that named the field.
 *
 * These live here rather than inline in the composable for the reason
 * given at the top of birthAdapters.ts: a formatter can be perfectly
 * tested while the call site quietly keeps reading one field. Pulling the
 * transformation out is what makes that regression visible.
 *
 * Everything here is pure: no `vue`, no `fetch`, no aliases. The unit
 * tests run the emitted JavaScript on plain Node, which resolves ESM
 * specifiers literally and has neither Vite nor its path aliases.
 */

/**
 * The subset of a normalized entity node these adapters read.
 *
 * `imo_number` rather than `imoNumber`: the producer's vocabulary is
 * lowerCamelCase and `normalizeNode` renames at the fetch boundary.
 *
 * No other vessel field is declared. The producer's serializer emits
 * mmsi, callSign, flagState, vesselType, buildYear, builder, length,
 * tonnage, owner, operator, previousNames and previousFlags alongside the
 * IMO number, and not one published vessel carries a value for any of
 * them — previousNames and previousFlags reach every vessel node as an
 * empty array, the rest are compacted away entirely. Declaring or
 * rendering a field that is empty on every subject tells a reader
 * nothing, which is the stance identificationDisplay.ts already takes on
 * its own unpopulated columns. If a source starts emitting one, add the
 * declaration together with the markup.
 */
export interface FactBearingEntity {
  gender?: string
  title?: string
  position?: string
  /**
   * Wider than the wire, deliberately. `VesselEntity` declares
   * `imo_number` a string and every published vessel carries one as a
   * JSON string, so `FullEntity` types it `string` and stays accurate to
   * the producer. This is the ADAPTER's input type, and it states what
   * the adapter will survive rather than what the producer sends: `text`
   * below coerces a finite number, and a test pins that. A type that
   * forbade the input its own function handles would be a contract
   * nothing could satisfy.
   */
  imo_number?: number | string
}

/** One labelled claim in the page's Position / Title block. */
export interface RoleClaim {
  /** Which producer field said it, and the `v-for` key. */
  label: string
  value: string
}

/** What a row is called when both fields state the same string. */
export const ROLE_BOTH_LABEL = 'Position and Title'

/**
 * A published string as a reader should see it, or null when it says
 * nothing.
 *
 * Whitespace is collapsed rather than preserved, for the reason
 * identificationDisplay.ts collapses it: values arrive carrying the
 * source document's own wrapping, and a UN title is published across two
 * lines broken at whatever width that XML used. Collapsing is also what
 * makes the duplicate test below reliable — the same office is published
 * into `title` and `position` with different line breaks.
 */
function text(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value !== 'string') return null
  const collapsed = value.replace(/\s+/g, ' ').trim()
  return collapsed || null
}

/**
 * The one-letter codes the sources publish, mapped to the word they
 * stand for. Keys are lowercased before lookup, so the same table also
 * absorbs the case variants — the sources publish "M", "Male" and "male"
 * for one claim, and printing three spellings of it across a result set
 * reads as three different facts.
 *
 * Only the exact tokens live data contains are expanded. Anything else
 * is passed through verbatim rather than guessed at: the producer's
 * contract is any non-blank string, and inventing a reading for a code
 * this table does not know would be the site asserting something no
 * authority published.
 */
const GENDER_WORDS = new Map([
  ['m', 'Male'],
  ['male', 'Male'],
  ['f', 'Female'],
  ['female', 'Female'],
])

/**
 * The subject's gender as the listing authority stated it, or null.
 *
 * Shown because a screening user matching a name against a list needs
 * every identifying attribute the authority published, and this one is
 * published for a substantial share of the people on it. It is presented
 * as a stated attribute in the identity block beside birth information,
 * never as a badge in the page header: the page is reporting what a
 * sanctions authority recorded about a person, not characterising them.
 *
 * @param entity the entity node, already normalized
 */
export function statedGender(entity: FactBearingEntity | null | undefined): string | null {
  const stated = text(entity?.gender)
  if (!stated) return null
  return GENDER_WORDS.get(stated.toLowerCase()) ?? stated
}

/**
 * Every distinct role the sources state for the subject.
 *
 * `title` and `position` are two producer fields and the page had been
 * reading only the second, under a heading naming both — so most people
 * who carry a title saw an empty section promising one. Both are read
 * here, each labelled with the field that stated it, because the two
 * disagree often enough to matter: the UN publishes one person's title as
 * "Colonel" and their position as "Major", and another's title as an
 * office ("Commander of IRGC Navy") against a position that is a rank
 * ("Rear Admiral"). Merging those into one line would hide a difference
 * a screener is entitled to see.
 *
 * When the two state the same string they collapse to a single row named
 * for both fields. Printing one sentence twice under two labels teaches a
 * reader nothing — the reasoning listingRemarks applies to a listing
 * remark repeated from the entity — and a row labelled for only one of
 * the two fields would misreport where the value came from.
 *
 * Ordered position first to match the heading above it, so a reader
 * following "Position / Title" left to right meets the rows in the order
 * the heading named them.
 *
 * Always an array, so the page can ask for its length without a null
 * guard.
 *
 * @param entity the entity node, already normalized
 */
export function roleClaims(entity: FactBearingEntity | null | undefined): RoleClaim[] {
  const position = text(entity?.position)
  const title = text(entity?.title)

  if (position && title && position === title) {
    return [{ label: ROLE_BOTH_LABEL, value: position }]
  }

  const claims: RoleClaim[] = []
  if (position) claims.push({ label: 'Position', value: position })
  if (title) claims.push({ label: 'Title', value: title })
  return claims
}

/**
 * A vessel's IMO number, or null.
 *
 * The search index has always indexed this field, so a vessel could be
 * found BY the number a reader typed and then show them a page that never
 * repeated it back. It is the vessel's permanent identifier — it survives
 * renaming and reflagging, which is exactly why an evasion-screening
 * reader wants it — so it belongs in the identity block, not buried.
 *
 * A number is accepted as well as a string: every value published today
 * is a string, but the producer passes the harmonized model's attribute
 * through untouched and a numeric one would otherwise vanish.
 *
 * @param entity the entity node, already normalized
 */
export function vesselImoNumber(entity: FactBearingEntity | null | undefined): string | null {
  return text(entity?.imo_number)
}
