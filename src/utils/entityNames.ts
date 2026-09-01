/**
 * Which of an entity's name variants heads the record, and which are aliases.
 *
 * One module because the same selection was written four times — in
 * `useEntityData`, inline in `EntityPage`'s template, and again in
 * `AnnouncementPage` and `GroupPage` — and each copy carried the same defect.
 * Fixing the composable alone left the entity page still rendering its own
 * inlined copy, so the bug stayed live on the page it was reported against.
 *
 * The defect: every copy tested `is_primary` and then read `full_name` from
 * whatever it found. The published data contains variants that carry
 * `isPrimary` and no name at all — `uk/bel0174` has
 * `names[0] = {script:"Latn", isPrimary:true}` with no `fullName`, and
 * `names[1] = {fullName:"KAZAKOV", firstName:"Pavel", isPrimary:true}`. The
 * find matched the empty variant, `full_name` was undefined, and the fallback
 * `names[0]` was that same object — so both misses landed on "Unknown" while a
 * perfectly good name sat one position later.
 *
 * Pure by construction: no `vue`, no `fetch`, no aliases. The unit tests run
 * the emitted JavaScript on plain Node.
 */

/** The shape every caller has after `normalizeNode`. */
export interface NameVariant {
  full_name?: string
  is_primary?: boolean
}

/**
 * The name to head the record with, or null when there is no name at all.
 *
 * Prefers a primary variant THAT HAS A NAME, then any variant that has one.
 * Returning null rather than "Unknown" leaves the caller to choose its own
 * placeholder — `AnnouncementPage` derives one from the entry id, which is
 * better than the word "Unknown" and would be lost if this baked one in.
 */
export function primaryNameOf(
  names: readonly NameVariant[] | undefined | null,
): string | null {
  if (!names?.length) return null

  const named =
    names.find((n) => n.is_primary && n.full_name) ?? names.find((n) => n.full_name)

  return named?.full_name ?? null
}

/**
 * Every other name the record carries, in source order, without duplicates.
 *
 * Excludes whatever `primaryNameOf` actually resolved to, rather than
 * everything flagged `is_primary`. On the 36% of sampled UK entities where NO
 * variant is flagged primary, the heading falls back to the first named
 * variant while an `is_primary` filter kept it — so the same string appeared
 * once as the heading and again as an alias, inflating the alias count a
 * reader takes as evidence of how widely the subject is known.
 *
 * Variants with no name are dropped: an empty string is not an alias, and
 * rendering one produces a bare bullet the reader cannot interpret.
 */
export function aliasesOf(
  names: readonly NameVariant[] | undefined | null,
): string[] {
  if (!names?.length) return []

  const heading = primaryNameOf(names)
  const seen = new Set<string>()
  const out: string[] = []

  for (const variant of names) {
    const name = variant.full_name
    if (!name || name === heading || seen.has(name)) continue
    seen.add(name)
    out.push(name)
  }

  return out
}
