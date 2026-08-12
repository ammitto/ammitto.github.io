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
 * Two rules govern everything here, and both are the producer's, not ours.
 *
 * 1. EARLIEST QUALIFYING, never "most precise". The gem's search index scans
 *    for the first record stating a value and stops
 *    (`search_index_exporter.rb`, `extract_birth_year`). Its spec pins this:
 *    `'still prefers the earliest record that states one'` feeds
 *    `[{year: 1984}, {date: '1990-01-08'}]` and expects `1984`. Ranking by
 *    precision would contradict a passing producer spec.
 *
 * 2. TWO INDEPENDENT SCANS. The exact scan (date or year) and the span scan
 *    (either bound) run separately over the whole list and may land on
 *    different records; the exporter publishes both results side by side.
 *    A span's two bounds always come from ONE record — never assembled from
 *    two — which its spec also pins.
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
 * The search index's birth fields, which are flat and camelCase rather than
 * a list: the gem emits `birthYear`, `birthYearFrom` and `birthYearTo` as
 * three row scalars, already stringified, and rows are read unnormalized.
 *
 * `birthYear` is absent for a span-only person by the producer's deliberate
 * choice — the span keys are excluded from its exact-value lookup — so the
 * bounds are the only birth signal such a person has.
 *
 * There are no date-bound columns to add here. `search_index_exporter.rb`
 * builds a row from three birth keys only, and a date span reaches it as the
 * year bounds the transformer derives from the endpoints — which is what
 * keeps such a person findable in a year-only index at all.
 */
export interface SearchBirthFields {
  birthYear?: string
  birthYearFrom?: string
  birthYearTo?: string
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
 * path, because a search row is flat rather than a list of records.
 *
 * Two independent scans, mirroring the producer: the earliest record
 * stating an exact date or year answers if one exists, otherwise the
 * earliest record stating a span. Bounds are read from that one record, so
 * a span is never assembled out of two different sources' claims.
 *
 * A date span adds no third rank. The scans decide WHICH record answers and
 * `formatBirthTemporal` decides how it reads, so a date span reaches this
 * line at full precision without a rule of its own. Treating date bounds as
 * an exact value here would be the harmful change: it would rank a span
 * above an earlier record's stated year and contradict the producer's
 * earliest-qualifying rule. A same-year date span needs no such rank either
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

/**
 * The birth value for a search-index row.
 *
 * The row is flat and already stringified, so it cannot go through the
 * record path. `birthYear` answers when the producer found an exact value;
 * otherwise the bounds do, which is the only birth signal a span-only
 * person's row carries. The index states no `circa`, so none is rendered.
 */
export function formatSearchBirth(fields: SearchBirthFields | null | undefined): string | null {
  if (!fields) return null

  const year = text(fields.birthYear)
  if (year) return year

  return formatRange(text(fields.birthYearFrom), text(fields.birthYearTo))
}
