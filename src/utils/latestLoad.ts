/**
 * Mark asynchronous detail-page loads as current or stale.
 *
 * Vue Router reuses a component when only a route parameter changes. A fetch
 * started for the old parameter can then finish after the new route has begun
 * loading. `begin` returns a predicate tied to that generation; starting a
 * newer load makes every older predicate false, so stale work can stop before
 * it writes page state. `invalidate` retires the current generation when its
 * component unmounts, stopping a long request chain after its active fetch.
 */
export interface LatestLoadGuard {
  begin: () => () => boolean
  invalidate: () => void
}

export function createLatestLoadGuard(): LatestLoadGuard {
  let latest = 0

  return {
    begin: () => {
      const generation = ++latest
      return () => generation === latest
    },
    invalidate: () => {
      latest += 1
    },
  }
}
