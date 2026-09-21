/**
 * An ordered map over an async operation, with a cap on how many run at
 * once.
 *
 * This lives here rather than inline in `useEntityData` so the unit tests
 * exercise the shipped pool instead of a copy of it. The first version of
 * this change kept the loop in the composable and reproduced it in the
 * test file; every assertion stayed green while the real loop was free to
 * become sequential, unbounded or unordered. Pulling the pool out is what
 * makes those regressions visible.
 *
 * Everything here is pure: no `vue`, no `fetch`, no `import.meta`, no path
 * aliases and no imports at all. The unit tests run the emitted JavaScript
 * on plain Node, which resolves ESM specifiers literally and has neither
 * Vite nor its aliases.
 */

/**
 * Entry nodes in flight at once.
 *
 * The cap exists so that an entity carrying a long entry list cannot open
 * one request per entry at the same moment. It is a conservative default,
 * not a measured optimum: nothing here has been timed against the live
 * dataset, and no claim is made about the transport.
 *
 * How many entries an entity actually carries, measured 2026-08-11 over
 * the published 146 MB `all.jsonld`: all 60,980 entities carry exactly
 * one — maximum 1, mean 1.00. So the cap binds on nothing today. It is
 * kept because the count is a property of the current sources rather than
 * an invariant of the model: the gem's `HarmonizeCommand#link_sanction_entry`
 * unions `hasSanctionEntry` across calls instead of assigning, and its own
 * spec constructs an entity holding two entry IRIs.
 */
export const ENTRY_FETCH_CONCURRENCY = 6

/**
 * Node files in flight while a browse page hydrates its index.
 *
 * Higher than `ENTRY_FETCH_CONCURRENCY` because it solves a different
 * problem. That cap protects against one entity opening a request per entry;
 * this one governs a page that knowingly fetches every node an index lists,
 * where the whole cost is round trips and there is nothing to protect
 * against but the browser.
 *
 * Measured against the live API on 2026-09-01: a single node round-trips in
 * ~0.30s, and the indexes hold 817 legal instruments, 37 organizations, 35
 * document types and 29 groups. Fetched one after another — which is what
 * these pages did — the legal-instruments page spent about 4.1 minutes
 * before it rendered anything, because it assigned its results only after
 * the loop finished.
 *
 * 12 rather than 6 because ammitto.org is served over HTTP/2 (verified:
 * `curl -o /dev/null -w '%{http_version}'` returns 2), so the old HTTP/1.1
 * six-connections-per-origin limit does not apply and the requests are
 * multiplexed on one connection.
 *
 * This is a mitigation, not the fix. 817 round trips at any concurrency is
 * the wrong shape; legal instruments want a published summary the way
 * `by-organization/` and `by-document-type/` already give
 * OrganizationPage and DocumentTypePage a single request. That is gem-side
 * work and is recorded in the data-defects note.
 */
export const BROWSE_INDEX_CONCURRENCY = 12

/**
 * Run `task` over `items` with at most `limit` in flight, and return the
 * results in the order of `items`.
 *
 * Input order, not completion order: results are written into a slot
 * fixed by the item's index and read back at the end. Collecting them as
 * each one lands would sort the list by network latency, which is a
 * visible behaviour change rather than a speed-up.
 *
 * A `null` result means "skipped" and is dropped from the returned array,
 * so one failing item shortens the list rather than emptying it or
 * punching a hole in it. `undefined` is not treated as a skip; a task that
 * wants to skip returns `null` explicitly.
 *
 * `limit` is clamped to at least 1. A limit of zero would otherwise start
 * no workers at all and return an empty array while items were waiting —
 * a silent data loss rather than a slow load.
 *
 * Errors are not swallowed: a task that rejects rejects the whole call,
 * and every result gathered so far is lost with it. Every caller therefore
 * catches its own and returns `null`, so a single unreachable item shortens
 * the list instead of emptying it.
 *
 * That shortening is not free, and a caller owes its reader the difference.
 * `useEntityData.fetchEntry` drops an entry it cannot reach; the five browse
 * pages go through `fetchNodeOnce` and `hydrationOutcome` in
 * `@/utils/indexHydration`, which count the drops so the page can say the list
 * is short and can tell "everything failed" from "there is nothing here" —
 * without that distinction an outage renders as an authoritative empty
 * dataset. A future caller that swallows failures owes the same accounting.
 */
export async function mapWithPool<T, R>(
  items: readonly T[],
  task: (item: T, index: number) => Promise<R | null>,
  limit: number = ENTRY_FETCH_CONCURRENCY,
): Promise<R[]> {
  const results: (R | null)[] = new Array(items.length).fill(null)

  // Shared by every worker. Reading and incrementing it happens with no
  // `await` in between, so no two workers can claim the same index.
  let cursor = 0

  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await task(items[index], index)
    }
  }

  const workers = Math.min(Math.max(1, Math.floor(limit)), items.length)
  await Promise.all(Array.from({ length: workers }, () => worker()))

  return results.filter((result): result is R => result !== null)
}
