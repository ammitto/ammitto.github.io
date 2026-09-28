/**
 * The search index's `metadata`, checked before the page states any of it.
 *
 * The block is typed but never validated, and every field of it ends up in a
 * sentence a screening analyst may file: "N data sources covering M sanctioned
 * entities", "no entity on the N lists matches X", "data as of D". A missing
 * field, a string, NaN or a nonsense timestamp would otherwise print as "0
 * lists", "NaN entities" or "1 January 1970". Each field is therefore either
 * valid or treated as absent, and the page words its sentences without it.
 */

/**
 * No index can predate the first one published. The site's first
 * search-index.json was generated on 2026-02-25; the floor sits a little
 * before it so a rebuilt historical index still passes.
 */
export const EARLIEST_GENERATED_MS = Date.UTC(2026, 0, 1)

/** How far ahead of the reader's clock a timestamp may be: clocks drift. */
export const CLOCK_SKEW_MS = 24 * 60 * 60 * 1000

/** What the producer writes (Ruby `Time#iso8601`), with or without fractions. */
const ISO_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:Z|([+-])(\d{2}):(\d{2}))$/

export interface CheckedMetadata {
  /** ISO timestamp, or '' when absent or implausible. */
  generated: string
  /** Positive whole number, or 0 when absent or invalid. */
  totalEntities: number
  /** Positive whole number, or 0 when absent or invalid. */
  sources: number
  /** Names of the fields that were absent or invalid. */
  invalid: string[]
}

/** `value` if it is a whole number above zero, otherwise 0. */
export function positiveCount(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0
}

/**
 * `value` if it is an ISO instant between the first published index and
 * (allowing for clock skew) now, otherwise ''.
 */
export function plausibleGenerated(value: unknown, now: number = Date.now()): string {
  const at = typeof value === 'string' ? isoInstantMs(value) : null
  if (at === null) return ''
  if (at < EARLIEST_GENERATED_MS || at > now + CLOCK_SKEW_MS) return ''
  return value as string
}

/**
 * The instant an ISO string names, or null when it names none.
 *
 * Not `Date.parse`: it rolls impossible calendar fields over, so
 * "2026-02-31" becomes 3 March and the page would state a date the metadata
 * never said. Every field must survive a round trip through the calendar.
 */
function isoInstantMs(value: string): number | null {
  const m = ISO_INSTANT.exec(value)
  if (!m) return null
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number)
  const wall = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  if (
    wall.getUTCFullYear() !== year ||
    wall.getUTCMonth() !== month - 1 ||
    wall.getUTCDate() !== day ||
    wall.getUTCHours() !== hour ||
    wall.getUTCMinutes() !== minute ||
    wall.getUTCSeconds() !== second
  ) {
    return null
  }
  const [sign, offsetHours, offsetMinutes] = [m[8], Number(m[9] ?? 0), Number(m[10] ?? 0)]
  if (offsetHours > 23 || offsetMinutes > 59) return null
  // Truncated to whole milliseconds, never rounded: as a float, .9999… rounds
  // up to a full second and can carry an instant across the floor.
  const fractionMs = Number((m[7] ?? '').slice(0, 3).padEnd(3, '0'))
  const offsetMs = (sign === '-' ? -1 : 1) * (offsetHours * 60 + offsetMinutes) * 60000
  return wall.getTime() + fractionMs - offsetMs
}

export function checkMetadata(raw: unknown, now: number = Date.now()): CheckedMetadata {
  const m = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const checked = {
    generated: plausibleGenerated(m.generated, now),
    totalEntities: positiveCount(m.totalEntities),
    sources: positiveCount(m.sources),
  }
  const invalid = Object.entries(checked)
    .filter(([, value]) => !value)
    .map(([field]) => field)
  return { ...checked, invalid }
}

/** "1 list", "14 lists": `n` with the noun agreeing. */
export function countOf(n: number, one: string, many: string): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`
}
