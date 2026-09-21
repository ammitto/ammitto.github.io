/**
 * Every template that links to a feed-supplied URL must route it through the
 * allowlist.
 *
 * `safeExternalUrl` is unit-tested, but a unit test cannot see whether the
 * templates actually call it. Without this file the guard could be deleted
 * from any of the seven call sites — or an eighth site added without it — and
 * all the other tests would stay green, which is exactly the shape of the
 * defect being guarded against.
 *
 * The values are external by contract: an announcement's `url`, an
 * organization's `url`, a legal instrument's `url` all arrive from a foreign
 * government feed by way of the harmonizer. Vue does not sanitise `:href`, so
 * a `javascript:` value would become a link that runs script when a reader
 * clicks it — on a page whose whole purpose is "go and read the official
 * designation".
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')

/** file -> the expression each guarded anchor binds. */
const CALL_SITES = {
  'src/views/AnnouncementPage.vue': 'announcement?.announcement?.url',
  'src/views/OrganizationPage.vue': 'organization.url',
  'src/views/LegalInstrumentPage.vue': 'instrument.url',
  'src/views/BrowseOrganizationsPage.vue': 'org.url',
  'src/views/EntityPage.vue': 'announcement.url',
  'src/components/molecules/SourceCard.vue': 'url',
  'src/components/organisms/TheFooter.vue': 'source.url',
}

for (const [file, expr] of Object.entries(CALL_SITES)) {
  test(`${file} routes its external link through the allowlist`, () => {
    const source = read(file)

    assert.match(
      source,
      /import \{ safeExternalUrl \} from '@\/utils\/externalUrl'/,
      `${file} must import safeExternalUrl`,
    )
    assert.ok(
      source.includes(`:href="safeExternalUrl(${expr}) as string"`),
      `${file} must bind href through safeExternalUrl(${expr})`,
    )
    // And render nothing when it fails: an <a> with no href still looks like a
    // link and does nothing, which is worse than no link.
    assert.ok(
      source.includes(`v-if="safeExternalUrl(${expr})"`),
      `${file} must not render the anchor when the URL is rejected`,
    )
  })
}

test('no template binds a raw feed URL straight into href', () => {
  // The regression this whole file exists for: a future edit that reintroduces
  // an unguarded binding, or adds an eighth call site without the guard.
  for (const file of Object.keys(CALL_SITES)) {
    const source = read(file)
    const raw = source.match(/:href="(?!safeExternalUrl)[^"]*\.url[^"]*"/g)
    assert.equal(
      raw,
      null,
      `${file} binds a URL into href without the allowlist: ${raw?.join(', ')}`,
    )
  }
})
