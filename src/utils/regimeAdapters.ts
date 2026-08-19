/**
 * The regime labels the entity page renders as badges.
 *
 * The page had been reconstructing a label from the regime's identifier,
 * because the entry's regime reference carried an `@id` and nothing else.
 * An identifier has already lost the punctuation and capitalisation a name
 * needs, so the reconstruction cannot be made to read well: `Al Qaida` for
 * `Al-Qaida`, `Au Afghanistan` for `Afghanistan`, `1533 Democratic People
 * S Republic Of The Congo` for `1533 (Democratic People's Republic of the
 * Congo)`. Measured over the published set, 158 of 178 regimes read worse.
 *
 * ammitto/ammitto#61 puts the name on the reference. This prefers it and
 * keeps the reconstruction only for records harmonized before that.
 *
 * These live here rather than inline in the composable for the reason
 * given at the top of entryAdapters.ts: a formatter can be perfectly
 * tested while the call site quietly keeps reading the wrong field.
 *
 * Everything here is pure: no `vue`, no `fetch`, no aliases.
 */

/** The subset of an entry these adapters read. */
export interface RegimeBearingEntry {
  regime?: { '@id'?: string; code?: string; name?: string }
}

/**
 * Rebuild a label from an IRI tail. Lossy by construction — see the note
 * above — and retained only as a fallback.
 */
export function labelFromIri(iri: string): string | null {
  const match = iri.match(/\/regime\/(.+)$/)
  if (!match) return null

  return match[1]
    .replace(/cn_/, 'China: ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * One label per distinct regime across the entries, in first-seen order.
 *
 * A blank name is treated as absent rather than rendered: a source that
 * states `""` has not named the regime, and an empty badge is worse than
 * a reconstructed one.
 */
export function regimeLabels(entries: RegimeBearingEntry[]): string[] {
  const labels: string[] = []

  for (const entry of entries ?? []) {
    const regime = entry?.regime
    if (!regime) continue

    const named = typeof regime.name === 'string' ? regime.name.trim() : ''
    if (named) {
      labels.push(named)
      continue
    }

    const iri = regime['@id']
    if (typeof iri !== 'string') continue

    const derived = labelFromIri(iri)
    if (derived) labels.push(derived)
  }

  return [...new Set(labels)]
}
