/**
 * Source-level wiring checks for the five non-entity detail pages.
 *
 * These pages stay mounted when Vue Router changes only `:id`. Their data
 * loader must therefore watch the computed route id, reset page state, and
 * reject stale async writes. The pure generation guard itself has behavioural
 * coverage in `latestLoad.test.js`.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pages = [
  {
    name: 'AnnouncementPage',
    routeId: 'sourceId',
    kind: 'group',
    rawPrimaryFetch: /fetch\(`\/api\/v1\/node\/group\/\$\{source\}\/\$\{docId\}\.jsonld`\)/,
    resets: [
      /announcement\.value = null/,
      /group\.value = null/,
      /entries\.value = \[\]/,
      /legalInstruments\.value = new Map\(\)/,
    ],
  },
  {
    name: 'GroupPage',
    routeId: 'groupId',
    kind: 'group',
    rawPrimaryFetch: /fetch\(`\/api\/v1\/node\/group\/\$\{source\}\/\$\{docId\}\.jsonld`\)/,
    resets: [/group\.value = null/, /entries\.value = \[\]/, /entities\.value = new Map\(\)/],
  },
  {
    name: 'DocumentTypePage',
    routeId: 'docTypeId',
    kind: 'document-type',
    rawPrimaryFetch: /fetch\(`\/api\/v1\/node\/document-type\/\$\{id\}\.jsonld`\)/,
    resets: [
      /documentType\.value = null/,
      /relatedAnnouncements\.value = \[\]/,
      /relatedInstruments\.value = \[\]/,
      /summaryUnavailable\.value = false/,
    ],
  },
  {
    name: 'LegalInstrumentPage',
    routeId: 'sourceId',
    kind: 'legal-instrument',
    rawPrimaryFetch: /fetch\(`\/api\/v1\/node\/legal-instrument\/\$\{id\}\.jsonld`\)/,
    resets: [/instrument\.value = null/, /relatedGroups\.value = \[\]/, /relatedEntries\.value = \[\]/],
  },
  {
    name: 'OrganizationPage',
    routeId: 'orgId',
    kind: 'organization',
    rawPrimaryFetch: /fetch\(`\/api\/v1\/node\/organization\/\$\{id\}\.jsonld`\)/,
    resets: [
      /organization\.value = null/,
      /publishedAnnouncements\.value = \[\]/,
      /signedAnnouncements\.value = \[\]/,
      /authorizedAnnouncements\.value = \[\]/,
      /summaryUnavailable\.value = false/,
    ],
  },
]

for (const { name, routeId, kind, rawPrimaryFetch, resets } of pages) {
  test(`${name} reloads when its route id changes`, () => {
    const source = readFileSync(join(root, `src/views/${name}.vue`), 'utf8')

    assert.match(source, new RegExp(`watch\\(${routeId},`))
    assert.match(source, /\{ immediate: true \}\)/)
    assert.ok(!/onMounted\(/.test(source), `${name} must not be mount-only`)
    assert.match(source, /loading\.value = true/)
    assert.match(source, /error\.value = null/)
    for (const reset of resets) assert.match(source, reset)
  })

  test(`${name} prevents an older request from publishing stale state`, () => {
    const source = readFileSync(join(root, `src/views/${name}.vue`), 'utf8')

    assert.match(source, /createLatestLoadGuard\(\)/)
    assert.match(source, /const isCurrent = loadGuard\.begin\(\)/)
    assert.match(source, /onUnmounted\(loadGuard\.invalidate\)/)
    assert.match(source, /if \(!isCurrent\(\)\) return/)
    assert.match(source, /if \(isCurrent\(\)\) loading\.value = false/)
  })

  test(`${name} fetches the same validated node path its download exposes`, () => {
    const source = readFileSync(join(root, `src/views/${name}.vue`), 'utf8')

    assert.match(source, new RegExp(`nodeDocumentPath\\(\\s*['"]${kind}['"]`))
    assert.match(source, /fetch\(\w+Href\)/)
    assert.doesNotMatch(source, rawPrimaryFetch)
  })
}
