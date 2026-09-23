/**
 * Matches found while the search index is still being built.
 *
 * The search page shows these under a "still checking" banner so a reader
 * sees results as soon as they exist instead of waiting for all rows. That is
 * only safe on a sanctions register if two things hold, and both live here so
 * they can be tested against a real FlexSearch index:
 *
 * 1. Every partial match is also a final match. FlexSearch intersects posting
 *    lists that only ever grow while rows are added, so a row that matches the
 *    partly built index still matches the finished one. The exception is a
 *    repeated id: `Index.add` with an id it already holds REPLACES that
 *    document's text, so a row shown early could stop matching once its later
 *    duplicate is indexed. Repeated ids are therefore withheld until the build
 *    is complete. (The live index carries none today; the producer does not
 *    promise that, see `SearchEntity` in useSearchIndex.)
 *
 * 2. Cards already on screen never move. Relevance order over a partial index
 *    is not the final order, so partial matches are shown in the order they
 *    were first found and new ones are appended; the one re-sort into
 *    relevance order happens when the build finishes.
 */

/** The part of a FlexSearch index this module needs. */
export interface PartialSearchable {
  search(query: string, options: { limit: number }): unknown[]
}

/**
 * Ids of the rows indexed so far that match `query`, in the index's own
 * relevance order, minus any id in `withheld`.
 *
 * Blank queries return nothing: the page shows placeholders, not a partial
 * unfiltered listing, when no query is typed.
 */
export function partialMatchIds(
  index: PartialSearchable,
  query: string,
  withheld: ReadonlySet<string>,
  limit: number,
): string[] {
  if (!query.trim()) return []
  const ids: string[] = []
  for (const raw of index.search(query, { limit })) {
    const id = String(raw)
    if (!withheld.has(id)) ids.push(id)
  }
  return ids
}

/**
 * `shown` followed by every id of `found` not already in it, in `found`'s
 * order. Never removes or reorders an id of `shown`.
 *
 * Returns `shown` itself when nothing is new, so a caller holding it in a
 * shallow ref does not trigger a re-render for an unchanged list.
 */
export function appendNewMatches(
  shown: readonly string[],
  found: readonly string[],
): readonly string[] {
  const seen = new Set(shown)
  let next: string[] | null = null
  for (const id of found) {
    if (seen.has(id)) continue
    seen.add(id)
    if (next === null) next = shown.slice()
    next.push(id)
  }
  return next ?? shown
}
