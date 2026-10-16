/**
 * Display a source's YYYY-MM-DD as a calendar date, never as the viewer's
 * local midnight. Date-only ISO strings parse at UTC; local formatting was
 * moving them to the previous day west of UTC. Validate before formatting,
 * because Date also silently rolls impossible dates into the next month.
 * Preserve other precision and invalid source values verbatim rather than
 * manufacturing a date or showing "Invalid Date".
 */
export function formatCivilDate(value?: string, month: 'short' | 'long' = 'long'): string {
  if (!value) return ''
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!parts) return value
  const year = Number(parts[1])
  const monthIndex = Number(parts[2]) - 1
  const day = Number(parts[3])
  const date = new Date(0)
  date.setUTCFullYear(year, monthIndex, day)
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== monthIndex || date.getUTCDate() !== day) return value
  return date.toLocaleDateString('en-US', { year: 'numeric', month, day: 'numeric', timeZone: 'UTC' })
}
