/**
 * The page-summary slices the publishing pipeline emits, and the mapping
 * from one into the rows a page renders.
 *
 * The organization and document-type pages used to answer their question by
 * fetching the entry index and then every entry node in the corpus — tens of
 * thousands of sequential requests, so at full scale the page never painted.
 * The gem now aggregates that at publish time into
 * `by-organization/{identifier}.jsonld` and
 * `by-document-type/{identifier}.jsonld`, and each page fetches only its own.
 *
 * This module is the single place the two repos meet. The field names below
 * are the producer's (`json_ld_graph_exporter.rb`,
 * `export_slices_by_organization` / `export_slices_by_document_type`); if the
 * gem ever respells one, the tests covering this module fail rather than the
 * pages silently rendering nothing.
 */
// Spelled with the '.js' extension the emitted JavaScript needs: unlike
// normalizeNode.ts this module has an import, and `npm run test:unit` runs
// the tsc output on plain Node, which resolves ESM specifiers literally.
// TypeScript and Vite both map it back to the .ts source.
import { toNodeIri } from './normalizeNode.js'

/**
 * A localized title exactly as the announcement carried it.
 *
 * The producer passes this through untouched because the two pages resolve
 * it differently — the organization page falls back to Chinese, the
 * document-type page does not — so resolving it at publish time would bake
 * one page's language policy into the artifact and change the other's
 * output.
 */
export type LocalizedTitle =
  | string
  | Array<{ value: string; lang: string } | { [key: string]: string }>

/** One announcement, already deduplicated and counted by the producer. */
export interface AnnouncementSummary {
  documentId: string
  title?: LocalizedTitle
  publishDate: string
  url?: string
  groupId?: string
  /**
   * Entries the producer folded into this document. Named for what it
   * counts: the pages display it as "N entities", which holds only while
   * one entry means one entity within a document.
   */
  entryCount: number
}

/** One legal instrument, in the order the instrument index lists them. */
export interface LegalInstrumentSummary {
  '@id': string
  identifier?: string
  name?: string
  title?: Array<{ 'zh-Hans'?: string; en?: string }> | string
  publishDate?: string
}

export interface OrganizationSummary {
  published?: AnnouncementSummary[]
  signed?: AnnouncementSummary[]
  authorized?: AnnouncementSummary[]
}

export interface DocumentTypeSummary {
  announcements?: AnnouncementSummary[]
  legalInstruments?: LegalInstrumentSummary[]
}

/** One rendered announcement row. */
export interface AnnouncementRow {
  document_id: string
  title: string
  publish_date: string
  url?: string
  entry_count: number
  group_id?: string
}

/** Path of an organization's summary. */
export function organizationSummaryUrl(identifier: string): string {
  return `/api/v1/by-organization/${identifier}.jsonld`
}

/** Path of a document type's summary. */
export function documentTypeSummaryUrl(identifier: string): string {
  return `/api/v1/by-document-type/${identifier}.jsonld`
}

/** A published list, or an empty one when the field is absent or malformed. */
export function summaryList<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

/**
 * Resolve summaries into rendered rows.
 *
 * Grouping, deduplication and counting already happened in the pipeline.
 * What stays here is what only a page can decide: its title fallback, and
 * the ordering — the same descending `localeCompare` over the same values
 * the pages always used, so the sequence a visitor sees is produced by the
 * comparison that always produced it.
 *
 * `groupId` goes through `toNodeIri` because that is the validation
 * `normalizeNode` applied while these rows were still read from entry
 * nodes: a group IRI that cannot name a page must not become a link.
 */
export function toAnnouncementRows(
  summaries: AnnouncementSummary[],
  resolveTitle: (summary: AnnouncementSummary) => string,
): AnnouncementRow[] {
  return summaries
    .map((summary) => ({
      document_id: summary.documentId,
      title: resolveTitle(summary),
      publish_date: summary.publishDate,
      url: summary.url,
      entry_count: summary.entryCount,
      group_id: toNodeIri(summary.groupId, 'group') ?? undefined,
    }))
    .sort((a, b) => b.publish_date.localeCompare(a.publish_date))
}
