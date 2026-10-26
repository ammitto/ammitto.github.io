import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const CACHE_LIMITS = Object.freeze({ entries: 96, assetBytes: 2 * 1024 * 1024, totalBytes: 16 * 1024 * 1024 })
const TYPES = {
  js: ['text/javascript', 'application/javascript'],
  css: ['text/css'],
  woff: ['font/woff', 'application/font-woff'],
  woff2: ['font/woff2'],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  webp: ['image/webp'],
  avif: ['image/avif'],
  gif: ['image/gif'],
  svg: ['image/svg+xml'],
}
const HASHED_ASSET = /^.+[-.][A-Za-z0-9_-]{8,}\.(js|css|woff2?|png|jpe?g|webp|avif|gif|svg)$/
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

/** Only emitted, hashed /assets files enter the cache's finite allowlist. */
export function generateServiceWorker(dist) {
  // Captured client-bundle provenance distinguishes emitted output from
  // public files whose names can resemble hashes. Legacy Vite fixtures retain
  // their original manifest path; Astro removes that path after its build.
  const astroManifest = join(dist, 'ammitto-static-assets.json')
  const capturedAstro = existsSync(astroManifest)
  let emitted
  if (capturedAstro) {
    const manifest = JSON.parse(readFileSync(astroManifest, 'utf8'))
    if (manifest.version !== 1 || !Array.isArray(manifest.files)
        || manifest.files.some(file => typeof file !== 'string' || !/^assets\/[^/]+$/.test(file))) {
      throw new Error('Invalid captured Astro client asset manifest')
    }
    emitted = [...new Set(manifest.files)].sort()
  } else {
    const manifest = JSON.parse(readFileSync(join(dist, '.vite/manifest.json'), 'utf8'))
    emitted = [...new Set(Object.values(manifest).flatMap((entry) =>
      [entry.file, ...(entry.css || []), ...(entry.assets || [])]))].sort()
  }
  const assets = []
  let bytes = 0
  for (const file of emitted) {
    if (typeof file !== 'string' || !/^assets\/[^/]+$/.test(file)) continue
    const name = file.slice('assets/'.length)
    const match = HASHED_ASSET.exec(name)
    if (!match) continue
    const path = join(dist, file)
    let stat
    try { stat = statSync(path) } catch (error) {
      // Astro may inline an emitted client script during HTML generation.
      // It retains provenance but is no longer a fetchable cache candidate.
      if (capturedAstro && error.code === 'ENOENT') continue
      throw error
    }
    if (!stat.isFile() || stat.size > CACHE_LIMITS.assetBytes) continue
    if (assets.length >= CACHE_LIMITS.entries || bytes + stat.size > CACHE_LIMITS.totalBytes) continue
    const body = readFileSync(path)
    assets.push([`/assets/${name}`, { bytes: body.byteLength, digest: sha256(body), types: TYPES[match[1]] }])
    bytes += body.byteLength
  }
  const template = readFileSync(fileURLToPath(new URL('./service-worker.js', import.meta.url)), 'utf8')
  const assetManifest = JSON.stringify(assets)
  const version = sha256(template + assetManifest)
  const source = template.replace('__AMMITTO_ASSETS__', () => assetManifest)
    .replace('__AMMITTO_CACHE_NAME__', `ammitto-static-v1-${version}`)
  writeFileSync(join(dist, 'service-worker.js'), source)
  return { assets, bytes, version }
}
