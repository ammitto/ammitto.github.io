/**
 * Birth information: which record answers, and how it reads.
 *
 * An entity carries one birth record per birth row its source stated, so a
 * person can hold several, and the row holding the date is not reliably
 * the first. Reading `birth_info[0]` hid published dates on the live site:
 * `entity/us/11018` states two place-only records before the one carrying
 * `1964-09-18`. (Corpus populations move with the data and are recorded in
 * the pull request, not here.)
 *
 * Two rules govern which record answers where only one value fits
 * (`selectBirthScalar`).
 *
 * 1. EARLIEST QUALIFYING, never "most precise": the first record stating a
 *    value answers, in the order the source stated them.
 *
 * 2. TWO INDEPENDENT SCANS. The exact scan (date or year) and the span scan
 *    (either bound) run separately over the whole list and may land on
 *    different records. A span's two bounds always come from ONE record,
 *    never assembled from two.
 *
 * A search-index row needs neither rule: the gem already reduced its records
 * to a list of years and spans (`birthYears`), and every one is shown.
 *
 * The wording mirrors `Ammitto::BirthInfo#formatted_date` exactly, because
 * the gem renders this same field in its own output. Two spellings of one
 * fact in one product is how a reader ends up believing they are looking at
 * two datasets.
 *
 * Entity nodes carry `year` and the year bounds as JSON NUMBERS; the search
 * index carries the same facts as STRINGS. Both are accepted and coerced here
 * rather than at each call site.
 *
 * The date bounds are strings everywhere: `json_ld_serializer.rb` puts the
 * model's `Date` object into the node, which generates as `"1961-01-01"`, and
 * a day has no numeric spelling to be confused with.
 */

/**
 * One birth record as it reaches a page.
 *
 * Snake_case because `normalizeNode` converts the producer's camelCase at
 * the fetch boundary, and because the older published snapshot the site must
 * keep rendering was snake_case already.
 */
export interface BirthRecord {
  date?: string
  year?: number | string
  date_range_from?: string
  date_range_to?: string
  year_range_from?: number | string
  year_range_to?: number | string
  circa?: boolean
  city?: string
  region?: string
  country?: string
}

/**
 * One birth value as a search-index row carries it.
 *
 * The gem publishes a row's birth years as `birthYears`, a list of typed
 * values (`Ammitto::Serialization::BirthYear::Year` and `::DateRange`): a
 * stated span becomes one `date_range`, otherwise every distinct year the
 * person's records state becomes one `year`, sorted, each with its own
 * `circa`. Values are four-digit strings; a range may leave either bound
 * out. Rows are read unnormalized, so this is the producer's spelling.
 *
 * There are no date bounds here. A date span reaches the index as the year
 * bounds the transformer derives from its endpoints, which is what keeps
 * such a person findable in a year-only index at all.
 */
export type SearchBirthYear =
  | { type: 'year'; value: string; circa?: boolean }
  | { type: 'date_range'; from?: string | null; to?: string | null; circa?: boolean }

/** The search-index row fields the birth helpers read. */
export interface SearchBirthFields {
  birthYears?: ReadonlyArray<SearchBirthYear>
}

/** Trim a value that may arrive as a number, and drop blanks. */
function text(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const rendered = String(value).trim()
  return rendered === '' ? null : rendered
}

/** Whether the record states a span of complete dates, on either side. */
function hasDateRange(record: BirthRecord): boolean {
  return text(record.date_range_from) !== null || text(record.date_range_to) !== null
}

/** Whether the record states a span of years, on either side. */
function hasYearRange(record: BirthRecord): boolean {
  return text(record.year_range_from) !== null || text(record.year_range_to) !== null
}

/**
 * Whether the record states a span at all.
 *
 * Either pair alone qualifies. A published date span always carries derived
 * year bounds too, so the year check would find it anyway; asking about both
 * means a record that ever arrives with only its date bounds is still
 * rendered rather than silently dropped for stating nothing.
 */
function hasRange(record: BirthRecord): boolean {
  return hasDateRange(record) || hasYearRange(record)
}

/** Whether the record states an exact date or a single year. */
function hasExact(record: BirthRecord): boolean {
  return text(record.date) !== null || text(record.year) !== null
}

/**
 * The span, closed or open on either side.
 *
 * An open bound renders as the direction it leaves open, so a one-sided span
 * is never mistaken for a closed one — `${from}-${to}` on an open-below
 * record would print "-1980", which reads as a negative year. The producer
 * states either bound alone, so both open shapes are reachable.
 *
 * One helper serves date and year bounds alike. The gem keeps
 * `formatted_date_range` and `formatted_year_range` as separate methods, but
 * their wording is identical apart from the values, and a second copy here
 * would be one more place for the two spans to drift out of step.
 */
function formatRange(from: string | null, to: string | null): string | null {
  if (from && to) return `${from}-${to}`
  if (from) return `${from} or later`
  if (to) return `no later than ${to}`
  return null
}

/**
 * The circa marker the gem uses. It applies to whatever label exists —
 * date, year or span — not to years alone: sources state "approximately"
 * alongside a span as readily as alongside a single year.
 */
function withCirca(label: string, circa?: boolean): string {
  return circa ? `c. ${label}` : label
}

/**
 * The temporal half of a record: date span, else year span, else
 * year-without-date, else date.
 *
 * The order is `BirthInfo#formatted_date`'s, and the first two branches are
 * why it matters. A date span publishes the endpoint years as year bounds as
 * well, so BOTH pairs sit on the one record: reading the year pair first
 * would print "1961-1962" for a span the source stated to the day, losing
 * the precision the bounds exist to carry.
 *
 * The producer also keeps `year` on a date span whose endpoints share one
 * year, so a span can co-occur with an exact value too. Span-first is what
 * stops the finer claim from losing to the coarser one in either collision.
 *
 * `year` is checked only when `date` is absent because every dated record
 * ALSO carries its own year — the transformer fills `year` from the parsed
 * date — so they are not alternatives to choose between.
 */
export function formatBirthTemporal(record: BirthRecord | null | undefined): string | null {
  if (!record) return null

  if (hasDateRange(record)) {
    const span = formatRange(text(record.date_range_from), text(record.date_range_to))
    return span ? withCirca(span, record.circa) : null
  }

  if (hasYearRange(record)) {
    const span = formatRange(text(record.year_range_from), text(record.year_range_to))
    return span ? withCirca(span, record.circa) : null
  }

  const date = text(record.date)
  const year = text(record.year)

  if (year && !date) return withCirca(year, record.circa)
  if (date) return withCirca(date, record.circa)

  return null
}

/** City, region and country, in the gem's `location` order. */
export function formatBirthPlace(record: BirthRecord | null | undefined): string | null {
  if (!record) return null
  const parts = [text(record.city), text(record.region), text(record.country)]
  const rendered = parts.filter(Boolean).join(', ')
  return rendered === '' ? null : rendered
}

/**
 * One record as one line: when it was, then where.
 *
 * Returns null for a record that states neither — the producer emits
 * `{"@type": "BirthInfo", "circa": false}` for a source row it could not
 * read, and `entity/us/11018` carries three of them. A caller must not
 * treat a non-empty `birth_info` array as proof of renderable content.
 */
export function formatBirthRecord(record: BirthRecord | null | undefined): string | null {
  const when = formatBirthTemporal(record)
  const where = formatBirthPlace(record)

  if (when && where) return `${when}, ${where}`
  return when || where || null
}

/**
 * Every distinct claim the entity carries, in the order its sources stated
 * them.
 *
 * Records are NOT collapsed to one. Several records are several assertions
 * about the same person, sources do disagree about a birth date, and a
 * screening reader who is shown only one of them is being told the others
 * do not exist.
 *
 * Deduplication is on the rendered line rather than on the raw fields, so
 * `1964` and `"1964"` collapse (the two artifacts disagree on type) while
 * records differing in place or in a stated `circa` stay apart, because
 * those differences reach the reader.
 */
export function formatBirthRecords(
  records: ReadonlyArray<BirthRecord> | null | undefined,
): string[] {
  if (!Array.isArray(records)) return []

  const seen = new Set<string>()
  const lines: string[] = []

  for (const record of records) {
    const line = formatBirthRecord(record)
    if (!line || seen.has(line)) continue
    seen.add(line)
    lines.push(line)
  }

  return lines
}

/**
 * The single birth value the sanctions-data view model carries, for
 * surfaces where only one line fits.
 *
 * Note that the browse page's adapter does not currently expose it, so no
 * card renders this today; that omission is deliberate and pending a
 * product decision. Search cards take the separate `formatSearchBirth`
 * path, because a search row carries years rather than records.
 *
 * Two independent scans: the earliest record
 * stating an exact date or year answers if one exists, otherwise the
 * earliest record stating a span. Bounds are read from that one record, so
 * a span is never assembled out of two different sources' claims.
 *
 * A date span adds no third rank. The scans decide WHICH record answers and
 * `formatBirthTemporal` decides how it reads, so a date span reaches this
 * line at full precision without a rule of its own. Treating date bounds as
 * an exact value here would be the harmful change: it would rank a span
 * above an earlier record's stated year and break the earliest-qualifying
 * rule. A same-year date span needs no such rank either
 * — the producer keeps its `year`, so the exact scan already stops on that
 * record, and it renders as the span rather than as the bare year.
 *
 * Temporal only — no place. The cards that show this already render country
 * in a badge of its own, and repeating it would read as two facts.
 */
export function selectBirthScalar(
  records: ReadonlyArray<BirthRecord> | null | undefined,
): string | null {
  if (!Array.isArray(records)) return null

  const exact = records.find((record) => record && hasExact(record))
  if (exact) return formatBirthTemporal(exact)

  const span = records.find((record) => record && hasRange(record))
  return span ? formatBirthTemporal(span) : null
}

/**
 * The first country any birth record states.
 *
 * Deliberately its own scan rather than the country of whichever record
 * supplied the date: an entity whose first record carries the place and
 * whose second carries the date would otherwise lose the country it
 * displays today.
 */
export function selectBirthCountry(
  records: ReadonlyArray<BirthRecord> | null | undefined,
): string | null {
  if (!Array.isArray(records)) return null

  for (const record of records) {
    const country = record ? text(record.country) : null
    if (country) return country
  }

  return null
}

/** The bounds of one search-row value, or its year; blanks dropped. */
function searchValueParts(value: SearchBirthYear): {
  year: string | null
  from: string | null
  to: string | null
} {
  if (value.type === 'date_range') {
    return { year: null, from: text(value.from), to: text(value.to) }
  }
  return { year: text(value.value), from: null, to: null }
}

/** The row's birth values, tolerating an absent or malformed list. */
function searchValues(fields: SearchBirthFields | null | undefined): SearchBirthYear[] {
  const values = fields?.birthYears
  if (!Array.isArray(values)) return []
  return values.filter((value) => value && typeof value === 'object')
}

/**
 * The birth value for a search-index row: every value the row lists, in the
 * producer's order, joined into the one line the card has room for.
 *
 * Each value reads the way `formatBirthTemporal` renders the same claim on
 * the entity page, circa marker and open-bound wording included, so a card
 * and its detail page never spell one fact two ways. They can differ in
 * precision only: the index carries years, the page the stated date.
 *
 * Several years are all shown. They are separate claims from separate
 * records, and a screening reader shown only one is being told the others
 * do not exist.
 */
export function formatSearchBirth(fields: SearchBirthFields | null | undefined): string | null {
  const labels: string[] = []

  for (const value of searchValues(fields)) {
    const { year, from, to } = searchValueParts(value)
    const label = year ?? formatRange(from, to)
    if (label) labels.push(withCirca(label, value.circa))
  }

  return labels.length === 0 ? null : labels.join(', ')
}

/**
 * Every year a search-index row states, once each, for the indexed text.
 *
 * Both bounds of a span are their own tokens rather than the rendered span,
 * so a reader searching "1959" finds a person stated as born between 1959
 * and 1965. `circa` adds nothing: an approximate year is still the year a
 * reader would type.
 */
export function searchBirthTokens(fields: SearchBirthFields | null | undefined): string[] {
  const tokens: string[] = []

  for (const value of searchValues(fields)) {
    const { year, from, to } = searchValueParts(value)
    for (const token of [year, from, to]) {
      if (token && !tokens.includes(token)) tokens.push(token)
    }
  }

  return tokens
}
