/**
 * Cross-repo contract tests for the page summaries.
 *
 * The organization and document-type pages no longer scan the corpus; they
 * read one summary file the gem publishes. That makes the field names below
 * a contract between two repositories that ship separately, and nothing else
 * in this repo would notice if the gem respelled one — the pages would just
 * render nothing. These tests pin the spelling, the request paths and the
 * ordering, so a drift fails here instead of in production.
 *
 * The producer side is `lib/ammitto/serialization/json_ld_graph_exporter.rb`
 * (`export_slices_by_organization`, `export_slices_by_document_type`).
 *
 * Plain JavaScript against the emitted module, for the reason spelled out at
 * the top of normalizeNode.test.js: Node 20 cannot import `.ts` directly.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  documentTypeSummaryUrl,
  organizationSummaryUrl,
  summaryList,
  toAnnouncementRows,
} from '../.test-build/utils/summarySlice.js'

/** The organization page's resolver: English, then Chinese, then Untitled. */
const orgTitle = (summary) => {
  const title = summary.title
  if (!title) return 'Untitled'
  if (typeof title === 'string') return title
  const en = title.find((t) => ('value' in t ? t.lang === 'en' : 'en' in t))
  if (en) return 'value' in en ? en.value : en.en
  const zh = title.find((t) => ('value' in t ? t.lang === 'zh' : 'zh-Hans' in t))
  if (zh) return 'value' in zh ? zh.value : zh['zh-Hans']
  return 'Untitled'
}

const summary = (overrides) => ({
  documentId: 'DOC-1',
  title: 'Title',
  publishDate: '2024-01-01',
  entryCount: 1,
  ...overrides,
})

test('requests the summary paths the gem writes', () => {
  assert.equal(
    organizationSummaryUrl('cn/ministry-of-commerce'),
    '/api/v1/by-organization/cn/ministry-of-commerce.jsonld',
  )
  assert.equal(
    documentTypeSummaryUrl('cn/state-council-order'),
    '/api/v1/by-document-type/cn/state-council-order.jsonld',
  )
})

test('reads exactly the field names the producer emits', () => {
  const rows = toAnnouncementRows(
    [
      summary({
        documentId: 'DOC-9',
        publishDate: '2020-05-06',
        url: 'https://example.test/doc-9',
        groupId: 'https://www.ammitto.org/group/cn/12',
        entryCount: 7,
      }),
    ],
    orgTitle,
  )

  assert.deepEqual(rows, [
    {
      document_id: 'DOC-9',
      title: 'Title',
      publish_date: '2020-05-06',
      url: 'https://example.test/doc-9',
      entry_count: 7,
      group_id: 'https://www.ammitto.org/group/cn/12',
    },
  ])
})

test('a respelled producer field surfaces as a missing value, so pin it here', () => {
  // entry_count / publish_date are the SITE's names; the producer emits
  // entryCount / publishDate. Reading the snake_case spelling off a summary
  // must not quietly work.
  const rows = toAnnouncementRows([{ documentId: 'D', publish_date: '2024-01-01', entry_count: 3 }], orgTitle)

  assert.equal(rows[0].publish_date, undefined)
  assert.equal(rows[0].entry_count, undefined)
})

test('sorts by publish date descending, keeping producer order within a tie', () => {
  const rows = toAnnouncementRows(
    [
      summary({ documentId: 'MID', publishDate: '2024-01-01' }),
      summary({ documentId: 'TIE-A', publishDate: '2030-01-01' }),
      summary({ documentId: 'TIE-B', publishDate: '2030-01-01' }),
      summary({ documentId: 'OLD', publishDate: '2001-01-01' }),
    ],
    orgTitle,
  )

  assert.deepEqual(
    rows.map((r) => r.document_id),
    ['TIE-A', 'TIE-B', 'MID', 'OLD'],
  )
})

test('sorts a missing publish date last, as the empty string the gem emits', () => {
  const rows = toAnnouncementRows(
    [summary({ documentId: 'BLANK', publishDate: '' }), summary({ documentId: 'DATED' })],
    orgTitle,
  )

  assert.deepEqual(
    rows.map((r) => r.document_id),
    ['DATED', 'BLANK'],
  )
})

test('rejects a group IRI that cannot name a page', () => {
  const bad = ['https://elsewhere.test/group/cn/1', 'https://www.ammitto.org/group/cn', 'https://www.ammitto.org/group/cn/../x', 'not an iri', undefined]

  for (const groupId of bad) {
    const [row] = toAnnouncementRows([summary({ groupId })], orgTitle)
    assert.equal(row.group_id, undefined, `expected ${groupId} to be rejected`)
  }
})

test('resolves a localized title through the page resolver, not the producer', () => {
  const [row] = toAnnouncementRows(
    [summary({ title: [{ 'zh-Hans': '标题' }, { en: 'English title' }] })],
    orgTitle,
  )

  assert.equal(row.title, 'English title')
})

test('falls back to Untitled when the summary carries no title', () => {
  const [row] = toAnnouncementRows([summary({ title: undefined })], orgTitle)

  assert.equal(row.title, 'Untitled')
})

test('treats an absent or malformed list as empty rather than throwing', () => {
  assert.deepEqual(summaryList(undefined), [])
  assert.deepEqual(summaryList(null), [])
  assert.deepEqual(summaryList({ nope: true }), [])
  assert.deepEqual(summaryList([1, 2]), [1, 2])
})
