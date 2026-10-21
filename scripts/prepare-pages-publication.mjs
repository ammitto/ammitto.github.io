import { readFile, writeFile, unlink, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const assetTypes = { 'all.jsonld': 'application/ld+json', 'all.ttl': 'text/turtle', 'ru.jsonld': 'application/ld+json', 'ru.ttl': 'text/turtle' }

// Release discovery may use latest; the published catalogue always pins a tag.
// A two-asset legacy release cannot establish complete RU publication.
export function releaseEntries(release) {
  if (release.draft !== false || release.prerelease !== false
      || !/^api-v1-[a-f0-9]{40}$/.test(release.tag_name || '')
      || release.target_commitish !== release.tag_name.slice('api-v1-'.length)
      || !Number.isFinite(Date.parse(release.published_at))
      || release.html_url !== `https://github.com/ammitto/data/releases/tag/${release.tag_name}`
      || !Array.isArray(release.assets) || release.assets.length !== 4) {
    throw new Error('A published ammitto/data release with exactly four verified bulk assets is required')
  }
  const entries = Object.entries(assetTypes).map(([name, mediaType]) => {
    const matches = release.assets.filter(asset => asset.name === name)
    const asset = matches[0]
    const url = `https://github.com/ammitto/data/releases/download/${release.tag_name}/${name}`
    if (matches.length !== 1 || asset.state !== 'uploaded'
        || asset.browser_download_url !== url
        || !Number.isSafeInteger(asset.size) || asset.size <= 0
        || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || '')
        || ![mediaType, 'application/octet-stream'].includes((asset.content_type || '').split(';')[0].trim().toLowerCase())) {
      throw new Error(`Release asset ${name} is missing or has unverified URL, size, digest or media type`)
    }
    return { name, url, mediaType, description: `${name} from the separately published bulk release; may differ from the site snapshot`, bytes: asset.size, digest: asset.digest,
      published: release.published_at, releaseTag: release.tag_name,
      sourceCommit: release.tag_name.slice('api-v1-'.length) }
  })
  return entries
}

export async function preparePublication(dist, release) {
  const external = releaseEntries(release)
  const cataloguePath = resolve(dist, 'api/v1/index.jsonld')
  const catalogue = JSON.parse(await readFile(cataloguePath, 'utf8'))
  if (!Array.isArray(catalogue.entries)) throw new Error('Generated catalogue has no entries')
  for (const name of ['all.jsonld', 'all.ttl']) {
    if (catalogue.entries.filter(entry => entry.name === name).length !== 1) throw new Error(`Generated catalogue must name ${name} exactly once`)
  }
  const source = catalogue.entries.find(entry => entry.name === 'sources')
  if (!Array.isArray(source?.members) || !source.members.includes('ru.ttl')) throw new Error('Generated source catalogue must include ru.ttl')
  const removed = ['all.jsonld', 'all.ttl', 'sources/ru.ttl']
  // Validate the complete generated tree before changing publication layout.
  for (const name of [...removed, 'sources/ru.jsonld']) {
    const info = await stat(resolve(dist, 'api/v1', name))
    if (!info.isFile() || info.size <= 0) throw new Error(`Generated ${name} is missing or empty`)
  }
  catalogue.entries = catalogue.entries.map(entry => {
    if (entry.name === 'all.jsonld' || entry.name === 'all.ttl') return { ...entry, ...external.find(asset => asset.name === entry.name) }
    if (entry.name === 'sources') return { ...entry, members: entry.members.filter(name => name !== 'ru.ttl') }
    return entry
  })
  // RU JSON-LD remains local for browser and API source consumers. Turtle is
  // separately discoverable, without pretending the local sources dir has it.
  catalogue.entries.push({ ...external.find(asset => asset.name === 'ru.ttl'), name: 'sources/ru.ttl' })
  catalogue.bulkRelease = { tag: release.tag_name, url: release.html_url, published: release.published_at }
  await writeFile(cataloguePath, `${JSON.stringify(catalogue, null, 2)}\n`)
  for (const name of removed) await unlink(resolve(dist, 'api/v1', name))
  return catalogue
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [dist, metadata] = process.argv.slice(2)
    if (!dist || !metadata) throw new Error('Usage: node scripts/prepare-pages-publication.mjs DIST RELEASE_JSON')
    await preparePublication(dist, JSON.parse(await readFile(metadata, 'utf8')))
    console.log('Pages layout prepared; large exports pin the verified data release')
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
