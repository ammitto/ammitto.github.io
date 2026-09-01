/**
 * Fetching every node an index lists, and being honest about what failed.
 *
 * The browse pages each walk an index and fetch one node per entry. Doing that
 * sequentially took about four and a half minutes on the 817-entry legal
 * instrument index, so the fetches were pooled — and pooling introduced two
 * problems that this module exists to solve rather than repeat five times.
 *
 * FIRST: a task that swallows its own failure turns an outage into an empty
 * dataset. The sequential loop let a fetch rejection propagate to the page's
 * catch, which set `error` and rendered the error state. A pooled task must
 * catch — one unreachable node should shorten the list, not empty it — but
 * catching every node's failure means that when EVERY node fails, the page
 * assigns `[]` with no error and renders "no results found". A total outage
 * then reads as an authoritative statement that the register is empty, which
 * on a sanctions site is the same class of defect as a false negative.
 *
 * SECOND: a partial drop is invisible. The pages render a count derived from
 * what was fetched, so two dropped nodes silently become a smaller total with
 * nothing saying so.
 *
 * Both matter more after pooling than before it, because the burst is what
 * provokes the failure. Fetching 817 files at concurrency 12 is roughly 160
 * requests a second from one reader; the sequential loop spaced them 0.3s
 * apart and could not trip a rate limiter. Observed while reviewing this
 * change: enough parallel requests from one machine made ammitto.org return
 * `429` from Varnish for several minutes, and a 429 is exactly the
 * `!response.ok` this code discards.
 *
 * So the outcome is reported, not inferred: callers get what loaded AND what
 * did not, and decide what to show.
 */

export interface HydrationOutcome<T> {
  /** The nodes that loaded, in index order. */
  items: T[]
  /** How many were requested. */
  requested: number
  /** How many failed and were dropped. */
  dropped: number
  /**
   * Every node failed and there was at least one to fetch.
   *
   * The signal for "show an error", as distinct from "show a short list":
   * a page that renders its empty state here would be telling the reader the
   * dataset is empty when the truth is that nothing could be reached.
   */
  allFailed: boolean
}

/**
 * Whether a failed response is worth one retry.
 *
 * 429 and 5xx are the transient shapes a burst provokes — rate limiting and
 * edge back-pressure. A 404 is not: the node genuinely is not published, and
 * retrying it only doubles the burst that caused the problem.
 */
export function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600)
}

/**
 * Fetch one node, retrying once on a transient failure.
 *
 * Returns null when the node could not be loaded, for any reason. The single
 * retry exists because the pooled burst is itself the most likely cause of the
 * failure, so the second attempt lands after the burst has thinned.
 */
export async function fetchNodeOnce<T>(
  url: string,
  delayMs = 250,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
  doFetch: typeof fetch = fetch,
): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await doFetch(url)
      if (response.ok) return (await response.json()) as T
      if (attempt === 0 && isRetryable(response.status)) {
        await sleep(delayMs)
        continue
      }
      console.warn(`Failed to load node: ${url} (HTTP ${response.status})`)
      return null
    } catch (e) {
      if (attempt === 0) {
        await sleep(delayMs)
        continue
      }
      console.warn(`Failed to load node: ${url}`, e)
      return null
    }
  }
  return null
}

/**
 * Turn a pooled fetch's results into an outcome a page can act on.
 *
 * `items` is what came back; `requested` is what was asked for. Everything
 * else is derived here so no page has to remember to compute it, and so the
 * all-failed case cannot be quietly rendered as an empty dataset.
 */
export function hydrationOutcome<T>(
  items: T[],
  requested: number,
): HydrationOutcome<T> {
  const dropped = Math.max(0, requested - items.length)
  return {
    items,
    requested,
    dropped,
    allFailed: requested > 0 && items.length === 0,
  }
}
