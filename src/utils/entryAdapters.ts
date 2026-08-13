/**
 * The view models the entity page renders its sanction ENTRIES from.
 *
 * An entity node describes a subject; an entry node describes one listing
 * of that subject by one authority. The page had been reading a single
 * field off the entries — the effective date — and dropping the rest of
 * what a listing states about itself.
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

/** The subset of a normalized entry node these adapters read. */
export interface PeriodBearingEntry {
  period?: {
    effective_date?: string
    listed_date?: string
    expiry_date?: string
    is_indefinite?: boolean
    last_updated?: string
  }
  remarks?: string
}

/** One labelled row in the page's Sanctions Information list. */
export interface PeriodRow {
  /** Stable key for `v-for`, and what the row is called to a reader. */
  label: string
  value: string
}

/**
 * The far-future date a source writes when a measure has no end, rather
 * than omitting the field. Recognised because rendering it literally
 * tells a reader the listing lapses on a named day nearly a millennium
 * out — a date that is wrong in a way a missing date is not.
 */
export const NO_SCHEDULED_END_SENTINEL = '2999-12-31'

/** What a sentinel expiry is shown as instead of the sentinel itself. */
export const NO_SCHEDULED_END_TEXT = 'No scheduled end'

/**
 * The period fields worth a row, in the order a reader needs them: when
 * the authority listed the subject, when the measure began to bite, when
 * it lapses, and when the record itself last moved.
 *
 * Each is its OWN row rather than one date row with a fallback chain,
 * because these are different facts and the sources prove it: the EU
 * publishes listings whose measure takes effect the day AFTER the listing
 * date, so a fallback that filled an empty "Effective Date" from the
 * listed date would misdate every one of them. A date labelled wrongly is
 * worse than a date missing.
 *
 * `lastUpdated` is qualified as the LISTING's, not left as a bare "Last
 * Updated": it moves when an authority amends the record, so under the
 * unqualified label a reader would take a recent maintenance edit for a
 * recent sanctions action.
 *
 * `isIndefinite` is deliberately absent. It contradicts the dates beside
 * it — sources emit `false` on records whose expiry is the no-end
 * sentinel, i.e. the flag claims a scheduled end for listings that have
 * none. A field that disagrees with the row above it informs nobody.
 */
const PERIOD_ROWS: Array<{
  label: string
  field: 'listed_date' | 'effective_date' | 'expiry_date' | 'last_updated'
}> = [
  { label: 'Listed Date', field: 'listed_date' },
  { label: 'Effective Date', field: 'effective_date' },
  { label: 'Expiry Date', field: 'expiry_date' },
  { label: 'Listing Last Updated', field: 'last_updated' },
]

/** A field's value only when the producer actually stated one. */
function statedDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/**
 * The dated rows for an entity's Sanctions Information block.
 *
 * Each field is resolved by its OWN scan across the entries, taking the
 * first entry that states it. Entities carry several listings and the
 * sources do not fill the same fields on each, so tying every row to
 * whichever entry answered first would blank rows that a later entry
 * states — the same separate-scans reasoning resolveEntityBirthFields
 * applies to country and birth date.
 *
 * Always an array, so the page can ask for its length without a null
 * guard, and empty rather than null when no entry dates anything.
 */
export function entryPeriodRows(
  entries: PeriodBearingEntry[] | null | undefined,
): PeriodRow[] {
  if (!Array.isArray(entries)) return []

  const rows: PeriodRow[] = []
  for (const { label, field } of PERIOD_ROWS) {
    let value: string | null = null
    for (const entry of entries) {
      value = statedDate(entry?.period?.[field])
      if (value) break
    }
    if (!value) continue
    rows.push({
      label,
      value: field === 'expiry_date' && value === NO_SCHEDULED_END_SENTINEL
        ? NO_SCHEDULED_END_TEXT
        : value,
    })
  }
  return rows
}

/**
 * The remarks the LISTINGS state, as distinct from the remarks the entity
 * states.
 *
 * They are genuinely different text and neither substitutes for the
 * other: an entity's remarks describe the subject, a listing's describe
 * that authority's action, and plenty of subjects carry listing remarks
 * with no entity remarks at all — which is why the page cannot keep
 * gating this on the entity field.
 *
 * Sources do sometimes repeat one string in both places, so anything
 * equal to the entity's own remarks is dropped: a reader learns nothing
 * from the same sentence printed twice under two headings. Near-duplicates
 * that merely repunctuate are deliberately NOT collapsed — deciding two
 * differing strings mean the same thing would hide source text, and the
 * headings already explain why the two look alike.
 *
 * @param entries the entity's normalized entry nodes
 * @param entityRemarks the entity's own remarks, if it states any
 */
export function listingRemarks(
  entries: PeriodBearingEntry[] | null | undefined,
  entityRemarks?: string | null,
): string[] {
  if (!Array.isArray(entries)) return []

  const entityText = typeof entityRemarks === 'string' ? entityRemarks.trim() : ''
  const seen = new Set<string>()
  const out: string[] = []

  for (const entry of entries) {
    const remarks = typeof entry?.remarks === 'string' ? entry.remarks.trim() : ''
    if (!remarks || remarks === entityText || seen.has(remarks)) continue
    seen.add(remarks)
    out.push(remarks)
  }
  return out
}
