/**
 * The facet selection applied to search-index rows, and the row fields it
 * reads.
 *
 * This lives here rather than inline in `useSearchIndex` for the same
 * reason `birthAdapters` does: that composable imports `vue`, so a test
 * can only reach its filtering through a Vue harness this project does not
 * have. Pulling the predicate out is what lets the unit tests run the
 * shipped code on plain Node instead of a copy of it.
 *
 * Everything here is pure: no `vue`, no `fetch`, no aliases.
 */

/** The row fields the facet filters read. All are optional but `type`. */
export interface FilterableSearchEntity {
  type: string
  authority?: string
  regime?: string
  status?: string
  country?: string
  listType?: string
}

/**
 * One entry per facet family. An absent or empty family is not a filter:
 * it leaves every row in. Within a family the values are alternatives;
 * across families they intersect.
 */
export interface SearchFilterSelection {
  authorities?: string[]
  types?: string[]
  regimes?: string[]
  statuses?: string[]
  countries?: string[]
  listTypes?: string[]
}

/**
 * Narrow `entityList` to the rows matching every selected facet family.
 *
 * A row missing the field a family selects on is dropped by that family —
 * including when the selected value is the literal string the producer
 * emits for an unplaced entry, because "the producer said unknown" and
 * "the producer said nothing" are different states.
 */
export function filterSearchEntities<T extends FilterableSearchEntity>(
  entityList: T[],
  filters: SearchFilterSelection,
): T[] {
  let result = entityList

  const { authorities } = filters
  if (authorities && authorities.length > 0) {
    result = result.filter((e) => e.authority && authorities.includes(e.authority))
  }

  const { types } = filters
  if (types && types.length > 0) {
    result = result.filter((e) => types.includes(e.type))
  }

  const { regimes } = filters
  if (regimes && regimes.length > 0) {
    result = result.filter((e) => e.regime && regimes.includes(e.regime))
  }

  const { statuses } = filters
  if (statuses && statuses.length > 0) {
    result = result.filter((e) => e.status && statuses.includes(e.status))
  }

  const { countries } = filters
  if (countries && countries.length > 0) {
    result = result.filter((e) => e.country && countries.includes(e.country))
  }

  const { listTypes } = filters
  if (listTypes && listTypes.length > 0) {
    result = result.filter((e) => e.listType && listTypes.includes(e.listType))
  }

  return result
}
