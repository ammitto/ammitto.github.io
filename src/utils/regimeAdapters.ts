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
 * TWO rules, because identity and rendering fail differently here.
 *
 * By IRI: one regime can reach two entries under two names. The
 * producer's OFAC mapping sends both the `IRAN` and `IRGC` programs to
 * code `IRAN`, naming them `Iran` and `Iran (IRGC)`, so an entity listed
 * under both carries one identity and two labels. The first name wins,
 * which is what the producer's own regime node does with
 * `@regimes[slug] ||=`, so the badge and the node agree.
 *
 * By text: two DIFFERENT regimes can carry the same name — `au_iran` and
 * `iran` are both "Iran". They are distinct identities, and this returns
 * one badge for them anyway, because the return type is the text a reader
 * sees and two identical badges tell that reader nothing. What is lost is
 * real: the page stops showing that the entity is listed under two
 * regimes. Saying so would mean disambiguating the label, which is a
 * design question about what a badge should carry, not something to
 * settle by rendering "Iran" twice.
 *
 * A blank name is treated as absent rather than rendered: a source that
 * states `""` has not named the regime, and an empty badge is worse than
 * a reconstructed one.
 */
export function regimeLabels(entries: RegimeBearingEntry[]): string[] {
  const labels: string[] = []
  const seenIris = new Set<string>()
  const seenLabels = new Set<string>()

  const remember = (label: string, iri: string | null) => {
    if (iri) seenIris.add(iri)
    if (seenLabels.has(label)) return
    seenLabels.add(label)
    labels.push(label)
  }

  for (const entry of entries ?? []) {
    const regime = entry?.regime
    if (!regime) continue

    const iri = typeof regime['@id'] === 'string' ? regime['@id'] : null
    if (iri && seenIris.has(iri)) continue

    const named = typeof regime.name === 'string' ? regime.name.trim() : ''
    if (named) {
      remember(named, iri)
      continue
    }

    if (!iri) continue

    const derived = labelFromIri(iri)
    if (derived) remember(derived, iri)
  }

  return labels
}
