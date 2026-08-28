/**
 * How a name becomes searchable tokens, and how a query that matched nothing
 * finds the names it nearly matched.
 *
 * Why this module exists
 * ---------------------
 * `useSearchIndex.ts` built its FlexSearch index with `tokenize: 'forward'` and
 * no `encode`, which means FlexSearch's default Latin encoder: lowercase, then
 * split on whitespace. Nothing else. Measured against the live index
 * (search-index.json, metadata.generated 2026-08-21T12:59:04Z, 61,099 rows) on
 * 2026-08-28, that produced these counts on www.ammitto.org/search:
 *
 *     al qaida  372      alqaida   0
 *     assad      67      assadd    0
 *     gaddafi    15      qadhafi  79      kadhafi  1
 *
 * The zeroes are the problem, not the disagreements. A sanctions register that
 * returns nothing renders "No results found — No entities match your current
 * search criteria", which is phrased as a finding about the world rather than
 * as a failure to match a string. An analyst who guessed a different
 * transliteration reads that as a clear.
 *
 * Two different defects hide behind one empty page, and they need two fixes:
 *
 *  1. `alqaida`, `islamsky` and accented spellings SHOULD match and don't,
 *     because punctuation and diacritics are not folded. That is `foldForSearch`
 *     below: it is the index's encoder, so document and query are folded the
 *     same way.
 *
 *  2. `kadhafi` vs `qadhafi` is a substituted first letter. No encoder fixes
 *     that — folding is not phonetics — and pretending otherwise would be worse
 *     than leaving it, because it would look fixed. That is `nearestNames`:
 *     a bounded edit-distance pass the empty state runs over the tokens the
 *     index actually holds, so the page can say "no match — did you mean
 *     Qadhafi?" instead of implying the person is not listed.
 *
 * Deliberately NOT phonetic. Soundex and Metaphone are tuned to English
 * orthography and mangle the Arabic, Cyrillic and Han transliterations that
 * dominate this corpus (Soundex codes "Qadhafi" and "Kadhafi" differently —
 * Q and K are in different code groups — so it would not even fix the case
 * that motivated this file).
 *
 * Pure by construction: no `vue`, no `fetch`, no path aliases. The unit tests
 * run the type-erased build on plain Node, which has neither Vite's resolver
 * nor tsc path rewriting.
 */

/**
 * Longest token that may be glued to its neighbour by `foldForSearch`.
 *
 * Sanctions transliteration variance is concentrated in short particles that
 * are sometimes hyphenated, sometimes spaced and sometimes run together:
 * `al-Qaida` / `al Qaida` / `alqaida`, `Abd al-Aziz`, `bin Laden`, `El Shafee`,
 * `Abu Bakr`. Gluing every adjacent pair would roughly double the index for no
 * benefit, so only pairs where one side is this short or shorter are glued —
 * which covers al, el, bin, ibn, abu, abd, ben, van, der, dos without reaching
 * ordinary name words.
 */
const GLUE_MAX_LEN = 4

/**
 * Fold one run of characters to its comparable form.
 *
 * NFKD splits a precomposed letter into base + combining mark, and the
 * `\p{M}` strip then removes the mark: "Islámský" -> "islamsky",
 * "Muḥammad" -> "muhammad", "Ṭāhir" -> "tahir". This matters because the
 * corpus carries the accented spelling and analysts type the unaccented one.
 */
export function foldToken(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
}

/**
 * The FlexSearch `encode` function: text in, comparable tokens out.
 *
 * Applied to documents at index time and to queries at search time, so the two
 * always agree. Splitting on `\P{L}\P{N}` (anything that is neither letter nor
 * number) rather than whitespace is what makes `al-Qaida`, `al'Qaida` and
 * `al Qaida` land on the same pair of tokens; the glued form is what lets the
 * one-word query `alqaida` reach them.
 */
export function foldForSearch(text: string): string[] {
  if (!text) return []

  const parts = foldToken(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)

  if (parts.length < 2) return parts

  // Preserve the split tokens, then add the glued pairs. Both forms are needed:
  // the split tokens serve `al qaida`, the glued ones serve `alqaida`.
  const out = parts.slice()
  for (let i = 0; i < parts.length - 1; i++) {
    const a = parts[i]
    const b = parts[i + 1]
    if (a.length <= GLUE_MAX_LEN || b.length <= GLUE_MAX_LEN) {
      out.push(a + b)
    }
  }

  // A name may repeat a particle ("Abd al-Rahman al-Nasser"); the index gains
  // nothing from the duplicate.
  return Array.from(new Set(out))
}

/**
 * Levenshtein distance between `a` and `b`, abandoned once it exceeds `max`.
 *
 * Returns `null` rather than the true distance when the bound is exceeded, so
 * callers cannot accidentally rank on a number that was never computed. The
 * early length check is what keeps this cheap enough to run against every
 * token in a 61k-row index: a candidate whose length differs by more than
 * `max` cannot possibly be within `max`.
 */
export function boundedEditDistance(
  a: string,
  b: string,
  max: number,
): number | null {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > max) return null

  // Single-row dynamic programming: `row[j]` is the distance between the
  // processed prefix of `a` and the first `j` characters of `b`.
  let row = Array.from({ length: b.length + 1 }, (_, j) => j)

  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    let rowMin = i

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const v = Math.min(
        next[j - 1] + 1, // insertion
        row[j] + 1, // deletion
        row[j - 1] + cost, // substitution
      )
      next.push(v)
      if (v < rowMin) rowMin = v
    }

    // Every distance on this row already exceeds the bound, and rows only grow.
    if (rowMin > max) return null
    row = next
  }

  const d = row[b.length]
  return d > max ? null : d
}

/**
 * How much misspelling to forgive, by query length.
 *
 * A short query has few characters to be wrong about, so one edit on a
 * four-letter word is a much bigger claim than one edit on "mudacumura".
 * Allowing two edits on a three-letter token would suggest most of the corpus.
 */
export function suggestionBudget(token: string): number {
  if (token.length <= 3) return 0
  if (token.length <= 6) return 1
  return 2
}

export interface NearMiss {
  /** The indexed token, in its folded form. */
  token: string
  /** Edit distance from the query token. Lower is closer. */
  distance: number
}

/**
 * The indexed tokens a failed query nearly matched.
 *
 * This is what makes the empty state safe to show. `kadhafi` returns one row
 * and `gaddafi` fifteen while `qadhafi` returns seventy-nine; the analyst has
 * no way to know the other spellings exist unless the page says so.
 *
 * `candidates` is expected to be the folded token set of the index, which the
 * caller already has to build in order to search at all. Results are sorted by
 * distance and then alphabetically, so the order is stable across runs and
 * across machines — a suggestion list that reshuffles between visits reads as
 * unreliable.
 */
export function nearestNames(
  query: string,
  candidates: Iterable<string>,
  limit = 5,
): NearMiss[] {
  const tokens = foldForSearch(query)
  if (tokens.length === 0) return []

  const best = new Map<string, number>()

  for (const token of tokens) {
    const budget = suggestionBudget(token)
    if (budget === 0) continue

    for (const candidate of candidates) {
      // An exact hit is not a near miss; the query would not have been empty.
      if (candidate === token) continue

      const d = boundedEditDistance(token, candidate, budget)
      if (d === null) continue

      const seen = best.get(candidate)
      if (seen === undefined || d < seen) best.set(candidate, d)
    }
  }

  return Array.from(best, ([token, distance]) => ({ token, distance }))
    .sort((a, b) => a.distance - b.distance || (a.token < b.token ? -1 : 1))
    .slice(0, limit)
}
