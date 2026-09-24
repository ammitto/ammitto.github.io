/**
 * Visit every item in order, handing the event loop back whenever a run of
 * work has used up its time budget.
 *
 * Built for the search-index build, where a fixed number of rows per step
 * cannot bound how long one step holds the main thread: the cost of adding a
 * row grows as the index fills, so a row count that is quick at the start is
 * slow at the end. Measuring elapsed time bounds each step directly.
 *
 * The clock is read once per `checkEvery` items rather than per item, so the
 * check itself stays negligible next to the work. A step can therefore
 * overrun the budget by at most one group of items.
 *
 * Only the timing of the yields depends on the clock. Every item is visited
 * exactly once, in array order, whatever `now` returns.
 */
export interface BudgetOptions {
  /** How long one step may run before yielding, in milliseconds. */
  budgetMs: number
  /** How many items to visit between clock reads. Must be at least 1. */
  checkEvery: number
  /**
   * Monotonic clock in milliseconds, e.g. `() => performance.now()`. If it
   * ever reads NaN or earlier than the step's start, the step counts as out
   * of budget and yields, so a bad clock costs extra yields rather than an
   * unbounded block.
   */
  now: () => number
  /** Hands control back to the event loop; resolves when work may resume. */
  yieldControl: () => Promise<void>
}

export async function forEachWithinBudget<T>(
  items: readonly T[],
  visit: (item: T) => void,
  { budgetMs, checkEvery, now, yieldControl }: BudgetOptions,
): Promise<void> {
  if (!Number.isInteger(checkEvery) || checkEvery < 1) {
    throw new RangeError(`checkEvery must be a positive integer, got ${checkEvery}`)
  }

  let i = 0
  while (i < items.length) {
    const stepStart = now()
    let elapsed: number
    do {
      const stop = Math.min(i + checkEvery, items.length)
      for (; i < stop; i++) visit(items[i])
      elapsed = now() - stepStart
    } while (i < items.length && elapsed >= 0 && elapsed < budgetMs)

    if (i < items.length) await yieldControl()
  }
}
