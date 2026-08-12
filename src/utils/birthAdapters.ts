/**
 * The view models the pages actually render birth information from.
 *
 * These live here rather than inline in the composables and views so the
 * tests exercise the shipped transformation instead of a helper the
 * shipped transformation merely happens to call. A formatter can be
 * perfectly tested while a call site quietly keeps reading record zero;
 * pulling the transformation out is what makes that regression visible.
 *
 * Everything here is pure: no `vue`, no `fetch`, no aliases. The unit
 * tests run the emitted JavaScript on plain Node, which resolves ESM
 * specifiers literally and has neither Vite nor its path aliases.
 */
import {
  formatBirthRecords,
  formatSearchBirth,
  selectBirthCountry,
  selectBirthScalar,
  type BirthRecord,
  type SearchBirthFields,
} from './birthDisplay.js'

/** The subset of a normalized entity node these adapters read. */
export interface BirthBearingEntity {
  country?: string
  addresses?: Array<{ country?: string }>
  birth_info?: BirthRecord[]
  nationalities?: Array<string | { country?: string; country_code?: string }>
}

/** The subset of a search-index row these adapters read. */
export interface SearchRow extends SearchBirthFields {
  id: string
  ref: string
  names: string[]
  type: string
  authority?: string
  status?: string
  country?: string
  regime?: string
  imo?: string
}

/**
 * Country and birth date for an entity in the sanctions-data view model.
 *
 * The two are resolved by SEPARATE scans on purpose. Country keeps its
 * existing fallback chain and takes the first birth record that states a
 * country; the date takes the first record that states a date or year.
 * Tying the country to whichever record supplied the date would blank the
 * badge for an entity whose place and date sit in different records.
 */
export function resolveEntityBirthFields(entity: BirthBearingEntity | null | undefined): {
  country: string | undefined
  birthDate: string | undefined
} {
  if (!entity) return { country: undefined, birthDate: undefined }

  const nationality = entity.nationalities?.[0]

  const country = entity.country ||
    entity.addresses?.[0]?.country ||
    selectBirthCountry(entity.birth_info) ||
    (typeof nationality === 'string' ? nationality : nationality?.country) ||
    undefined

  return {
    country,
    birthDate: selectBirthScalar(entity.birth_info) ?? undefined,
  }
}

/**
 * Every distinct birth claim for the entity detail page.
 *
 * Always an array, so the page can ask for its length without a null
 * guard, and empty rather than null when nothing is renderable — a
 * non-empty `birth_info` is not proof of content, because the producer
 * emits a bare `{"@type": "BirthInfo", "circa": false}` for a source row
 * it could not read.
 */
export function entityBirthClaims(
  entity: { birth_info?: BirthRecord[] } | null | undefined,
): string[] {
  return formatBirthRecords(entity?.birth_info)
}

/**
 * A search-index row as the entity card consumes it.
 *
 * `birthDate` comes through `formatSearchBirth` rather than straight from
 * `birthYear`, because the producer omits `birthYear` entirely for a
 * person whose birth is stated as a span — the bounds are then the row's
 * only birth signal, and reading the field alone shows them nothing.
 */
export function searchRowToCard(row: SearchRow): {
  id: string
  ref: string
  names: string[]
  entityType: string
  source: string
  status: 'active' | 'suspended' | 'delisted'
  listedDate: undefined
  country: string | undefined
  birthDate: string | undefined
} {
  return {
    id: row.id,
    ref: row.ref,
    names: row.names,
    entityType: row.type,
    source: row.authority || 'unknown',
    status: (row.status || 'active') as 'active' | 'suspended' | 'delisted',
    listedDate: undefined,
    country: row.country,
    birthDate: formatSearchBirth(row) ?? undefined,
  }
}

/**
 * The text a search-index row is indexed under.
 *
 * Both span bounds are indexed as their own tokens rather than as the
 * rendered span, so a reader searching "1959" finds a person stated as
 * born between 1959 and 1965 — who carries no `birthYear` to match on.
 */
export function searchRowText(row: SearchRow): string {
  return [
    ...row.names,
    row.country,
    row.regime,
    row.authority,
    row.imo,
    row.birthYear,
    row.birthYearFrom,
    row.birthYearTo,
  ].filter(Boolean).join(' ')
}
