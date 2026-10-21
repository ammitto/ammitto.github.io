// Optional UI acceleration data, generated from the exact API rows being shipped.
import { build } from 'esbuild'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repository = fileURLToPath(new URL('../', import.meta.url))
const TARGET_CHUNK_BYTES = 256 * 1024
const MAX_CHUNK_BYTES = 1024 * 1024
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const dictionary = value => value !== null && typeof value === 'object' && !Array.isArray(value)

let toolsPromise
function sharedTools() {
  // Bundle the real source and dependencies, including package JSON imports.
  // A data URL avoids persistent generated modules and Node 20 JSON assertions.
  return toolsPromise ??= build({
    stdin: {
      contents: `export { createSearchIndex, SEARCH_RUNTIME_FORMAT, SEARCH_ENGINE_VERSION } from './searchRuntime.ts';
        export { orderShards, isSearchIndexManifest } from './searchShards.ts';
        export { checkMetadata } from './indexMetadata.ts';
        export { searchRowText } from './birthAdapters.ts';
        export { indexableText } from './searchEncode.ts';`,
      loader: 'ts', resolveDir: resolve(repository, 'src/utils'),
    },
    bundle: true, write: false, platform: 'node', format: 'esm',
    alias: { '@': resolve(repository, 'src') },
  }).then(result => import(`data:text/javascript;base64,${Buffer.from(`${result.outputFiles[0].text}\n//# sourceURL=search-runtime-build-tools.mjs`).toString('base64')}`))
}

export function partitionSearchRuntimeDictionary(value, kind, score) {
  const chunks = []
  let entries = []
  let bytes = 2
  const finish = () => {
    if (!entries.length) return
    const text = `{${entries.join(',')}}`
    const sha256 = digest(text)
    chunks.push({ descriptor: { file: `${sha256}.json`, sha256, bytes: Buffer.byteLength(text), kind,
      ...(kind === 'map' ? { score } : {}) }, text })
    entries = []
    bytes = 2
  }
  for (const [key, item] of Object.entries(value)) {
    const entry = `${JSON.stringify(key)}:${JSON.stringify(item)}`
    const entryBytes = Buffer.byteLength(entry)
    if (entryBytes + 2 > MAX_CHUNK_BYTES) throw new Error(`Search runtime ${kind} entry exceeds 1 MiB`)
    if (entries.length && bytes + 1 + entryBytes > TARGET_CHUNK_BYTES) finish()
    bytes += entryBytes + (entries.length ? 1 : 0)
    entries.push(entry)
  }
  finish()
  return chunks
}

/** Generate only dist/search-runtime; leave every API file intact. */
export async function prepareSearchRuntime(dist, apiRoot = resolve(dist, 'api/v1')) {
  const tools = await sharedTools()
  const installed = JSON.parse(await readFile(createRequire(import.meta.url).resolve('flexsearch/package.json'), 'utf8'))
  if (installed.version !== tools.SEARCH_ENGINE_VERSION) throw new Error('Unsupported installed FlexSearch version')
  const indexDirectory = resolve(apiRoot, 'search-index')
  const manifest = JSON.parse(await readFile(resolve(indexDirectory, 'manifest.json'), 'utf8'))
  if (!tools.isSearchIndexManifest(manifest) || tools.checkMetadata(manifest.metadata).invalid.length
      || !Number.isSafeInteger(manifest.metadata.totalEntities) || !Number.isSafeInteger(manifest.metadata.sources)
      || new Set(manifest.shards.map(shard => shard.file)).size !== manifest.shards.length
      || manifest.shards.some(shard => !shard.code.trim() || !Number.isSafeInteger(shard.count) || shard.count <= 0)
      || manifest.shards.reduce((total, shard) => total + shard.count, 0) !== manifest.metadata.totalEntities) {
    throw new Error('Invalid search runtime source manifest or metadata')
  }
  const rows = []
  for (const shard of tools.orderShards(manifest.shards)) {
    const value = JSON.parse(await readFile(resolve(indexDirectory, shard.file), 'utf8'))
    if (!Array.isArray(value?.entities) || value.entities.length !== shard.count) {
      throw new Error(`Invalid search runtime source shard ${shard.file}`)
    }
    for (const row of value.entities) {
      if (!dictionary(row) || typeof row.id !== 'string' || !row.id.trim()
          || !Array.isArray(row.names) || row.names.some(name => typeof name !== 'string')
          || (row.primaryName !== undefined && typeof row.primaryName !== 'string')) {
        throw new Error(`Invalid search runtime row in ${shard.file}`)
      }
      rows.push(row)
    }
  }
  const bundles = (await readdir(resolve(dist, 'assets'), { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.endsWith('.js')).map(entry => entry.name).sort()
  if (!bundles.length) throw new Error('Search runtime requires built JavaScript assets')
  const rowsDigest = digest(JSON.stringify(rows))
  const ids = new Map()
  const index = tools.createSearchIndex()
  for (const row of rows) {
    if (!ids.has(row.id)) ids.set(row.id, ids.size)
    // Updates change FlexSearch tie order, so duplicates must also be replayed.
    index.add(ids.get(row.id), tools.indexableText(tools.searchRowText(row), row.primaryName
      ? [row.primaryName, ...row.names]
      : row.names))
  }
  const parts = Object.create(null)
  await index.export((key, text) => { parts[key] = JSON.parse(text) })
  if (Object.keys(parts).sort().join(',') !== 'cfg,ctx,map,reg'
      || !dictionary(parts.cfg) || Object.keys(parts.cfg).sort().join(',') !== 'doc,opt'
      || parts.cfg.doc !== 0 || parts.cfg.opt !== 1
      || !Array.isArray(parts.ctx) || parts.ctx.length !== 1 || !dictionary(parts.ctx[0]) || Object.keys(parts.ctx[0]).length
      || !dictionary(parts.reg) || !Array.isArray(parts.map) || parts.map.length !== 9 || !parts.map.every(dictionary)) {
    throw new Error('Unsupported FlexSearch export shape')
  }
  const chunks = partitionSearchRuntimeDictionary(parts.reg, 'reg')
  parts.map.forEach((bucket, score) => chunks.push(...partitionSearchRuntimeDictionary(bucket, 'map', score)))
  if (chunks.length > 1024) throw new Error('Search runtime exceeds supported chunk count')
  const output = {
    format: tools.SEARCH_RUNTIME_FORMAT, engine: tools.SEARCH_ENGINE_VERSION,
    generated: manifest.metadata.generated, rowsDigest, rowCount: rows.length,
    entityCount: ids.size, registeredCount: Object.keys(parts.reg).length,
    cfg: parts.cfg, ctx: parts.ctx, bundles, chunks: chunks.map(chunk => chunk.descriptor),
  }
  const outputDirectory = resolve(dist, 'search-runtime')
  await mkdir(outputDirectory, { recursive: true })
  for (const { descriptor, text } of chunks) {
    const file = resolve(outputDirectory, descriptor.file)
    try { await writeFile(file, text, { flag: 'wx' }) }
    catch (error) {
      if (error.code !== 'EEXIST') throw error
      if (await readFile(file, 'utf8') !== text) throw new Error(`Existing search runtime chunk is corrupt: ${descriptor.file}`)
    }
  }
  // Publish only after source validation, complete export and every chunk write.
  await writeFile(resolve(outputDirectory, 'index.json'), `${JSON.stringify(output)}\n`)
  return output
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [dist = 'dist', apiRoot] = process.argv.slice(2)
    const manifest = await prepareSearchRuntime(dist, apiRoot)
    console.log(`Search runtime: ${manifest.rowCount} rows, ${manifest.entityCount} entities, ${manifest.chunks.length} chunks`)
  } catch (error) { console.error(error); process.exitCode = 1 }
}
