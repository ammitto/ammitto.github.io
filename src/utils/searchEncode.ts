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
 *     alqaida    0      binladen  0      islamsky  0
 *     assadd     0      gaddafi  15      qadhafi  79      kadhafi  1
 *
 * The zeroes are the problem, not the disagreements. A sanctions register that
 * returns nothing renders "No results found — No entities match your current
 * search criteria", which is phrased as a finding about the world rather than
 * as a failure to match a string. An analyst who guessed a different
 * transliteration reads that as a clear.
 *
 * Three different defects hide behind one empty page, and they need three
 * different mechanisms — which is why this module has three exports rather
 * than one clever encoder:
 *
 *  1. Accented and punctuated spellings SHOULD match and don't. That is
 *     `foldForSearch`: NFKD-fold, strip marks, split on anything that is
 *     neither letter nor number. It is the index's `encode`, so document and
 *     query are folded identically. It does nothing else, deliberately — see 2.
 *
 *  2. `alqaida` written as one word SHOULD reach `Al-Qaida` and doesn't. That
 *     is `gluedForms`, applied via `indexableText` to DOCUMENTS ONLY.
 *     It cannot live in the encoder. FlexSearch runs `encode` on the query and
 *     then INTERSECTS the terms, so a glued query token demands a document
 *     where those two words are adjacent in that order. When this module did
 *     that, `ali leilabadi` went 9 results -> 0 against the listed person "Ali
 *     Hajinia Leilabadi", `bank mine` 4 -> 0, `dedrone axon` 1 -> 0, and a
 *     sweep of 1,313 two-word queries lost results on 426 and zeroed 340.
 *     tests/searchIndexRecall.test.js searches a real index to keep that shut.
 *
 *  3. `kadhafi` vs `qadhafi` is a substituted first letter. No encoder fixes
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
 * Longest token that may be glued to its neighbour by `gluedForms`.
 *
 * Sanctions transliteration variance is concentrated in short particles that
 * are sometimes hyphenated, sometimes spaced and sometimes run together:
 * `al-Qaida` / `al Qaida` / `alqaida`, `Abd al-Aziz`, `bin Laden`, `El Shafee`,
 * `Abu Bakr`. Gluing every adjacent pair would roughly double the index for no
 * benefit, so only pairs where one side is this short or shorter are glued.
 *
 * This threshold does NOT cleanly separate particles from name words, and an
 * earlier comment here claimed it did. It does not: kim, khan, wang, chen,
 * inc, llc, ltd, corp and bank are all four characters or fewer. That is
 * harmless now only because gluing is confined to documents — an extra
 * document token costs index space, while an extra QUERY token cost 340 zeroed
 * searches. Do not move this to the encoder on the strength of the threshold
 * looking conservative.
 */
const GLUE_MAX_LEN = 4

/**
 * Fold one run of characters to its comparable form.
 *
 * NFKD splits a precomposed letter into base + combining mark, and the
 * `\p{M}` strip then removes the mark: "Islámský" -> "islamsky",
 * "Muḥammad" -> "muhammad", "Ṭāhir" -> "tahir". This matters because the
 * corpus carries the accented spelling and analysts type the unaccented one.
 *
 * Known and accepted limit: a token made ONLY of combining marks — a bare
 * U+0301, a standalone Indic vowel sign — folds away to nothing, where
 * FlexSearch's own default separator (which covers separators, symbols,
 * punctuation and controls, but not marks) would have kept it. That is a real
 * behavioural difference and it is deliberate: base-plus-mark text always
 * retains its base character, document and query fold identically, and a
 * mark-only token is not a name. Restoring it would add index noise to serve
 * input no reader types.
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
 * `al Qaida` land on the same pair of tokens.
 *
 * This function does NOT glue. It used to, and that was a mass false negative.
 * FlexSearch runs `encode` on the QUERY as well as the document and then
 * INTERSECTS the resulting terms, so a glued query token demands a document in
 * which those two words are adjacent, in that order. Measured over the live
 * 61,099-row index, `ali leilabadi` went from 9 results to 0 against the listed
 * person "Ali Hajinia Leilabadi", `bank mine` 4 -> 0, `dedrone axon` 1 -> 0; a
 * sweep of 1,313 two-word queries built from real primary names lost results on
 * 426 and zeroed 340. The GLUE_MAX_LEN <= 4 rule was supposed to catch only
 * particles, but it also catches kim, khan, wang, chen, inc, llc, ltd, bank —
 * which is what drove the zeroes.
 *
 * Gluing therefore happens once, at index time, via `gluedForms` below.
 */
export function foldForSearch(text: string): string[] {
  if (!text) return []

  return foldToken(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

/**
 * Extra tokens to add to a DOCUMENT so a run-together query can reach it.
 *
 * `al-Qaida` indexes as [al, qaida] plus the glued [alqaida], so the one-word
 * query `alqaida` — which encodes to exactly one term — finds it, while the
 * two-word query `al qaida` still matches on the plain pair. Nothing here ever
 * runs on a query, so no glued form can become an AND term the corpus cannot
 * satisfy.
 *
 * Only adjacent pairs where one side is short are glued; see GLUE_MAX_LEN.
 */
export function gluedForms(text: string): string[] {
  const parts = foldForSearch(text)
  if (parts.length < 2) return []

  const out = new Set<string>()
  for (let i = 0; i < parts.length - 1; i++) {
    const a = parts[i]
    const b = parts[i + 1]
    if (a.length <= GLUE_MAX_LEN || b.length <= GLUE_MAX_LEN) {
      // No guard against `a + b` equalling a part: `foldForSearch` ends in
      // `.filter(Boolean)`, so both are non-empty and the concatenation is
      // strictly longer than either. Instrumenting the branch over all 61,099
      // live rows fired it zero times, which is what "by construction" should
      // look like when checked.
      out.add(a + b)
    }
  }
  return Array.from(out)
}

/**
 * The text to index for a row: its full text, plus glued forms taken ONLY from
 * the individual names.
 *
 * The two arguments are separate because gluing is a name-particle device and
 * must not reach across a field boundary. `searchRowText` joins the names to
 * the country, regime, authority and IMO with spaces, so gluing its output
 * produced tokens that straddle the join: a person named "Mohammad" from Iran
 * yielded `mohammadiran`. Because the index uses `tokenize: 'forward'`, the
 * query `mohammadi` then matched that token by prefix, and 55 of the 101 rows
 * returned for the Iranian surname carried no such name — measured over the
 * live 61,099-row index. Inflating a sanctions result set with people who do
 * not bear the name is a quieter failure than missing one, but it is still the
 * page reporting something that is not so.
 *
 * Each name is glued on its own, so no glued token spans two aliases either.
 */
export function indexableText(text: string, names: readonly string[]): string {
  const glued = new Set<string>()
  for (const name of names) {
    for (const g of gluedForms(name)) glued.add(g)
  }
  return glued.size ? `${text} ${Array.from(glued).join(' ')}` : text
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
