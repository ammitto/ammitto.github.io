/**
 * The identification table the entity page renders.
 *
 * This lives here rather than inline in the view so the tests exercise the
 * shipped transformation instead of a helper the view merely happens to
 * call, and so the question of which columns exist is answered once,
 * against the records in hand, rather than restated in markup.
 *
 * The producer publishes each record as type, number, issuingCountry,
 * countryIsoCode, issueDate, expiryDate and note (Ammitto::Identification),
 * which `normalizeNode` renames to snake_case at the fetch boundary — so
 * `issuingCountry` arrives here as `issuing_country`. Only the four fields
 * below are read: no identification in the published graph carries an issue
 * date, an expiry date or an ISO code, and a column that is empty for every
 * row tells a reader nothing. If the producer starts emitting them, add the
 * column together with the field.
 */

/** The subset of a normalized identification record this module reads. */
export interface IdentificationRecord {
  type?: string
  number?: string
  issuing_country?: string
  note?: string
}

/** One record as a table row; a field the record did not state is null. */
export interface IdentificationRow {
  type: string | null
  number: string | null
  issuingCountry: string | null
  note: string | null
}

export interface IdentificationTable {
  rows: IdentificationRow[]
  /** Whether any row states an issuing country, i.e. whether to give it a column. */
  hasIssuingCountry: boolean
}

/**
 * A published string as a reader should see it, or null when it says nothing.
 *
 * Whitespace is collapsed rather than preserved. Values arrive carrying the
 * source document's own formatting: a passport number published as
 * "AB187304 " (un/cdi040), and notes wrapped and indented at whatever width
 * the source XML used, whose newlines fall mid-sentence and mean nothing.
 * Numbers are accepted as well as strings, because a numeric identification
 * number is exactly the value this table exists to show.
 */
function text(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value !== 'string') return null
  const collapsed = value.replace(/\s+/g, ' ').trim()
  return collapsed || null
}

/**
 * An issuing country, or null when the field names no country.
 *
 * The EU list writes "00" where its source stated no country. It is neither
 * a country name nor an ISO 3166-1 alpha-2 code, and it is the only
 * letter-free value published in this field, so requiring a letter drops the
 * placeholder without touching a real value.
 */
function toIssuingCountry(value: unknown): string | null {
  const country = text(value)
  return country && /[A-Za-z]/.test(country) ? country : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Build the table for one entity's identifications.
 * @param records the entity's normalized `identifications`, if it has any
 */
export function identificationTable(records: unknown): IdentificationTable {
  const rows: IdentificationRow[] = []

  if (Array.isArray(records)) {
    for (const record of records) {
      if (!isRecord(record)) continue

      const row: IdentificationRow = {
        type: text(record.type),
        number: text(record.number),
        issuingCountry: toIssuingCountry(record.issuing_country),
        note: text(record.note),
      }

      // A record stating nothing would render as a row of dashes, which
      // reads as data withheld rather than data never published.
      if (row.type || row.number || row.issuingCountry || row.note) rows.push(row)
    }
  }

  return {
    rows,
    hasIssuingCountry: rows.some((row) => row.issuingCountry !== null),
  }
}
