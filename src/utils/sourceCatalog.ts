/**
 * Which sources the site knows about, and which of them the API actually
 * serves an aggregate for.
 *
 * These are two different questions and the composable used to conflate
 * them: it fetched `sources/{code}.jsonld` for every code it listed, so
 * every browse visit spent two requests discovering a 404 it could have
 * known about. The sources concerned harmonize to zero entities, so the
 * deploy publishes no aggregate for them at all — and the deploy's own
 * verify gate holds them at zero, which means the 404 is the designed
 * outcome rather than a broken upload.
 *
 * Dropping those codes from the list would swap one defect for a worse
 * one. The list is also what the browse page iterates to assemble its
 * results, and both sources are expected to start publishing once their
 * data-repo work lands; a list that had quietly forgotten them would then
 * keep working and keep showing nothing, with no 404 left to notice. So
 * every source stays named here and the two facts are kept apart: the
 * catalogue says what exists, `SOURCES_WITHOUT_AGGREGATE` says what is not
 * served yet. Publishing one is a one-line deletion from that set.
 *
 * Everything here is pure: no `vue`, no `fetch`, no aliases. The unit
 * tests run the emitted JavaScript on plain Node, which resolves ESM
 * specifiers literally and has neither Vite nor its path aliases.
 */

/**
 * Every source the site knows about, in display order.
 *
 * This stays complete whether or not a source is currently served, because
 * it is the iteration order for assembling browse results as well as the
 * fetch list.
 */
export const ALL_SOURCES: readonly string[] = [
  'eu', 'un', 'us', 'wb', 'uk', 'au', 'ca', 'ch', 'cn',
  'ru', 'tr', 'nz', 'jp', 'eu_vessels', 'un_vessels',
]

/**
 * Sources that harmonize to zero entities and therefore have no aggregate
 * published under `api/v1/sources/`.
 *
 * Requesting one is a guaranteed 404, so the fetch is skipped rather than
 * made and mourned. Membership here is a statement about the deploy, not
 * about the source being unwanted: when a code starts publishing, delete
 * it from this set and nothing else has to change.
 */
export const SOURCES_WITHOUT_AGGREGATE: readonly string[] = [
  'ru',
]

/**
 * Whether `source` has an aggregate to fetch.
 *
 * The negative is the interesting case, so it is the one the caller reads:
 * a source absent from the catalogue is still treated as fetchable, since
 * an unknown code is a caller's mistake to surface, not one to silence.
 */
export function publishesAggregate(
  source: string,
  withoutAggregate: readonly string[] = SOURCES_WITHOUT_AGGREGATE,
): boolean {
  return !withoutAggregate.includes(source)
}

/**
 * The subset of `all` worth requesting, in the order given.
 *
 * Returns a new array, so a caller cannot narrow the shared catalogue by
 * mutating what it got back.
 */
export function fetchableSources(
  all: readonly string[] = ALL_SOURCES,
  withoutAggregate: readonly string[] = SOURCES_WITHOUT_AGGREGATE,
): string[] {
  return all.filter(source => publishesAggregate(source, withoutAggregate))
}
