import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, access, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { releaseEntries, preparePublication } from '../scripts/prepare-pages-publication.mjs'
import { measureArchive, PAGE_ARCHIVE_LIMIT } from '../scripts/verify-pages-size.mjs'

function release() {
  const tag = `api-v1-${'a'.repeat(40)}`
  return { draft: false, prerelease: false, tag_name: tag, target_commitish: 'a'.repeat(40),
    published_at: '2026-10-21T12:00:00Z', html_url: `https://github.com/ammitto/data/releases/tag/${tag}`,
    assets: ['all.jsonld', 'all.ttl', 'ru.jsonld', 'ru.ttl'].map((name, index) => ({ name,
      state: 'uploaded', size: 100 + index, digest: `sha256:${'b'.repeat(64)}`,
      content_type: name.endsWith('ttl') ? 'text/turtle; charset=utf-8' : 'application/ld+json',
      browser_download_url: `https://github.com/ammitto/data/releases/download/${tag}/${name}` })) }
}

test('bulk catalogue pins exact release URLs with real asset provenance', () => {
  const entries = releaseEntries(release())
  assert.equal(entries.length, 4)
  assert.equal(entries[0].bytes, 100)
  assert.equal(entries[0].published, '2026-10-21T12:00:00Z')
  assert.equal(entries[0].sourceCommit, 'a'.repeat(40))
  assert.equal(entries[0].digest, `sha256:${'b'.repeat(64)}`)
  assert.match(entries[0].url, /download\/api-v1-a{40}\/all.jsonld$/)
})

for (const [name, mutate] of Object.entries({
  legacy: value => { value.assets = value.assets.slice(0, 2) },
  target: value => { value.target_commitish = 'main' },
  draft: value => { value.draft = true },
  prerelease: value => { value.prerelease = true },
  foreign: value => { value.html_url = 'https://github.com/other/data/releases/tag/x' },
  mutable: value => { value.assets[0].browser_download_url = 'https://github.com/ammitto/data/releases/latest/download/all.jsonld' },
  duplicate: value => { value.assets[1] = value.assets[0] },
  digest: value => { delete value.assets[0].digest },
  size: value => { value.assets[0].size = 0 },
  type: value => { value.assets[0].content_type = 'text/html' },
  upload: value => { value.assets[0].state = 'new' },
})) test(`rejects ${name} release metadata`, () => {
  const value = release(); mutate(value)
  assert.throws(() => releaseEntries(value), /release|Release/)
})

test('publication keeps local searchable data and distinguishes release from site snapshot', async () => {
  const dist = await mkdtemp(join(tmpdir(), 'ammitto-publication-test-'))
  try {
    const api = join(dist, 'api/v1')
    await mkdir(join(api, 'sources'), { recursive: true })
    const catalogue = { generated: '2026-10-22T12:00:00Z', entries: [
      { name: 'all.jsonld', url: 'all.jsonld', bytes: 999 },
      { name: 'all.ttl', url: 'all.ttl', bytes: 999 },
      { name: 'sources', url: 'sources', members: ['ru.jsonld', 'ru.ttl', 'cn.ttl'] },
    ] }
    await writeFile(join(api, 'index.jsonld'), JSON.stringify(catalogue))
    for (const name of ['all.jsonld', 'all.ttl', 'sources/ru.jsonld', 'sources/ru.ttl', 'sources/cn.ttl']) await writeFile(join(api, name), 'retained source data')
    // Invalid release does not remove generated files or rewrite metadata.
    const legacy = release(); legacy.assets.pop()
    await assert.rejects(preparePublication(dist, legacy))
    assert.equal(JSON.parse(await readFile(join(api, 'index.jsonld'))).generated, catalogue.generated)
    await access(join(api, 'all.jsonld'))
    const result = await preparePublication(dist, release())
    assert.equal(result.generated, catalogue.generated)
    assert.equal(result.bulkRelease.published, '2026-10-21T12:00:00Z')
    assert.equal(result.entries[0].bytes, 100)
    assert.deepEqual(result.entries.find(entry => entry.name === 'sources').members, ['ru.jsonld', 'cn.ttl'])
    assert.match(result.entries.find(entry => entry.name === 'sources/ru.ttl').url, /\/ru.ttl$/)
    for (const name of ['all.jsonld', 'all.ttl', 'sources/ru.ttl']) await assert.rejects(access(join(api, name)))
    assert.equal(await readFile(join(api, 'sources/ru.jsonld'), 'utf8'), 'retained source data')
    await access(join(api, 'sources/cn.ttl'))
  } finally { await rm(dist, { recursive: true, force: true }) }
})

test('Pages size gate measures actual tar headers as well as payload', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ammitto-pages-size-test-'))
  try {
    await writeFile(join(directory, 'index.html'), 'tiny payload')
    const bytes = await measureArchive(directory)
    assert.ok(bytes > 'tiny payload'.length)
    assert.equal(PAGE_ARCHIVE_LIMIT, 950_000_000)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
