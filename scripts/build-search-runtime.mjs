// Optional UI acceleration data, generated from the exact API rows being shipped.
import { build } from 'esbuild'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync, gunzipSync } from 'node:zlib'

const repository = fileURLToPath(new URL('../', import.meta.url))
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const dictionary = value => value !== null && typeof value === 'object' && !Array.isArray(value)

let toolsPromise
function sharedTools() {
  // Bundle the real source and dependencies, including package JSON imports.
  // A data URL avoids persistent generated modules and Node 20 JSON assertions.
  return toolsPromise ??= build({
    stdin: {
      contents: `export { createSearchIndex, SEARCH_RUNTIME_FORMAT, SEARCH_ENGINE_VERSION } from './searchRuntime.ts';
        export { encodeSearchRuntimeBinary, SEARCH_RUNTIME_PARTITIONS, SEARCH_BINARY_MAX_BYTES } from './searchRuntimeBinary.ts';
        export { orderShards, isSearchIndexManifest } from './searchShards.ts';
        export { checkMetadata } from './indexMetadata.ts';
        export { searchRowText } from './birthAdapters.ts';
        export { indexableText } from './searchEncode.ts';
        export { fastDocuments, encodeFastColumns, decodeFastColumns, decodeFastIds, decodeFastRows, validateFastManifest, FAST_ROW_CHUNK, FAST_FILTER_FIELDS, suggestionTokenList, decodeSuggestionTokens } from './searchFast.ts';`,
      loader: 'ts', resolveDir: resolve(repository, 'src/utils'),
    },
    bundle: true, write: false, platform: 'node', format: 'esm',
    alias: { '@': resolve(repository, 'src') },
  }).then(result => import(`data:text/javascript;base64,${Buffer.from(`${result.outputFiles[0].text}\n//# sourceURL=search-runtime-build-tools.mjs`).toString('base64')}`))
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
  const sources = []
  const sourceCounts = []
  for (const shard of tools.orderShards(manifest.shards)) {
    const bytes = await readFile(resolve(indexDirectory, shard.file))
    sources.push([shard.code, shard.file, digest(bytes)])
    sourceCounts.push([shard.count, bytes.byteLength])
    const value = JSON.parse(bytes.toString('utf8'))
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
  const sourceDigest = digest(JSON.stringify(sources))
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
  const seen = new Set()
  for (const bucket of parts.map) for (const list of Object.values(bucket)) for (const id of list) seen.add(String(id))
  if (seen.size !== Object.keys(parts.reg).length || [...seen].some(id => parts.reg[id] !== 1)) {
    throw new Error('Search runtime register does not match postings')
  }
  const maps = Array.from({ length: tools.SEARCH_RUNTIME_PARTITIONS }, () =>
    Array.from({ length: 9 }, () => Object.create(null)))
  parts.map.forEach((bucket, score) => {
    for (const [term, values] of Object.entries(bucket)) {
      if (!term.length) throw new Error('Search runtime contains an empty term')
      maps[(term.charCodeAt(0) || 0) % tools.SEARCH_RUNTIME_PARTITIONS][score][term] = values
    }
  })
  const assets = maps.map(partition => {
    if (partition.every(bucket => Object.keys(bucket).length === 0)) return null
    const registered = new Set()
    for (const bucket of partition) for (const values of Object.values(bucket)) for (const id of values) registered.add(id)
    const raw = tools.encodeSearchRuntimeBinary(partition, ids.size)
    const bytes = gzipSync(raw, { level: 9 })
    if (bytes.byteLength > tools.SEARCH_BINARY_MAX_BYTES) throw new Error('Compressed search runtime partition exceeds 64 MiB')
    const sha256 = digest(bytes)
    return { bytes, descriptor: { file: `${sha256}.bin`, sha256, bytes: bytes.byteLength,
      decodedBytes: raw.byteLength, registeredCount: registered.size } }
  })
  const partitions = assets.map(asset => asset?.descriptor ?? null)
  // Partition-first assets: ids, filter columns and card rows in doc-ID order,
  // all derived from the rows parsed from the exact shard bytes hashed above.
  const fastAssets = []
  const fastAsset = value => {
    const raw = Buffer.from(JSON.stringify(value))
    const bytes = gzipSync(raw, { level: 9 })
    const sha256 = digest(bytes)
    fastAssets.push({ bytes, descriptor: { file: `${sha256}.bin` } })
    return { file: `${sha256}.bin`, sha256, bytes: bytes.byteLength, decodedBytes: raw.byteLength }
  }
  const docs = tools.fastDocuments(rows)
  const idList = [...ids.keys()]
  if (docs.length !== idList.length || docs.some((doc, index) => doc.id !== idList[index])) {
    throw new Error('Search runtime document order does not match ids')
  }
  const columns = tools.encodeFastColumns(docs)
  // A filter value that is neither a string nor null/absent cannot be encoded
  // exactly. The deploy still ships (the page falls back to the regular
  // builder), but never silently: a loud error, a reason in index.json and a
  // marker file that CI and tests can assert on.
  let fastDisabled = null
  if (!columns) {
    const offending = docs.flatMap(doc => tools.FAST_FILTER_FIELDS
      .filter(field => doc[field] !== undefined && doc[field] !== null && typeof doc[field] !== 'string')
      .map(field => `${doc.id} ${field}=${JSON.stringify(doc[field])}`))
    fastDisabled = `non-string filter values (${offending.length}): ${offending.slice(0, 5).join('; ')}`
    console.error(`::error title=Search fast assets disabled::${fastDisabled}`)
  }
  let fast = null
  if (columns) {
    const suggestions = tools.suggestionTokenList(docs)
    const chunks = []
    for (let start = 0; start < docs.length; start += tools.FAST_ROW_CHUNK) chunks.push(docs.slice(start, start + tools.FAST_ROW_CHUNK))
    fast = {
      rowChunk: tools.FAST_ROW_CHUNK,
      ids: fastAsset(idList),
      columns: fastAsset(columns),
      rows: chunks.map(fastAsset),
      suggestions: fastAsset(suggestions),
      sources: sources.map(([code, file, sha256], index) => ({ code, file, count: sourceCounts[index][0], sha256, bytes: sourceCounts[index][1] })),
    }
    // Round-trip every emitted asset and require it to reproduce the shard-derived values exactly.
    tools.validateFastManifest(fast, idList.length)
    const read = descriptor => JSON.parse(gunzipSync(fastAssets.find(item => item.descriptor.file === descriptor.file).bytes))
    const readIds = tools.decodeFastIds(read(fast.ids), idList.length)
    if (JSON.stringify(readIds) !== JSON.stringify(idList)) throw new Error('Fast ids do not match source rows')
    if (JSON.stringify(tools.decodeFastColumns(read(fast.columns), idList.length)) !== JSON.stringify(columns)) {
      throw new Error('Fast columns do not match source rows')
    }
    fast.rows.forEach((descriptor, chunk) => {
      if (JSON.stringify(tools.decodeFastRows(read(descriptor), readIds, chunk)) !== JSON.stringify(chunks[chunk])) {
        throw new Error('Fast rows do not match source rows')
      }
    })
    if (JSON.stringify(tools.decodeSuggestionTokens(read(fast.suggestions))) !== JSON.stringify(suggestions)) {
      throw new Error('Fast suggestions do not match source rows')
    }
    if (digest(JSON.stringify(fast.sources.map(source => [source.code, source.file, source.sha256]))) !== sourceDigest) {
      throw new Error('Fast sources do not match source digest')
    }
  }
  const output = {
    format: tools.SEARCH_RUNTIME_FORMAT, engine: tools.SEARCH_ENGINE_VERSION,
    generated: manifest.metadata.generated, sourceDigest, rowCount: rows.length,
    entityCount: ids.size, registeredCount: Object.keys(parts.reg).length,
    cfg: parts.cfg, ctx: parts.ctx, bundles,
    partitions, partitionsDigest: digest(JSON.stringify(partitions)),
    fast, fastDigest: digest(JSON.stringify(fast)), ...(fastDisabled ? { fastDisabled } : {}),
  }
  const outputDirectory = resolve(dist, 'search-runtime')
  await mkdir(outputDirectory, { recursive: true })
  for (const asset of [...assets, ...fastAssets]) {
    if (!asset) continue
    const file = resolve(outputDirectory, asset.descriptor.file)
    try { await writeFile(file, asset.bytes, { flag: 'wx' }) }
    catch (error) {
      if (error.code !== 'EEXIST') throw error
      const existing = await readFile(file)
      if (!existing.equals(asset.bytes)) throw new Error(`Existing search runtime asset is corrupt: ${asset.descriptor.file}`)
    }
  }
  const marker = resolve(outputDirectory, 'fast-disabled.json')
  if (fastDisabled) await writeFile(marker, `${JSON.stringify({ reason: fastDisabled })}\n`)
  else await rm(marker, { force: true })
  // Publish only after source validation, complete export and every chunk write.
  await writeFile(resolve(outputDirectory, 'index.json'), `${JSON.stringify(output)}\n`)
  return output
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [dist = 'dist', apiRoot] = process.argv.slice(2)
    const manifest = await prepareSearchRuntime(dist, apiRoot)
    console.log(`Search runtime: ${manifest.rowCount} rows, ${manifest.entityCount} entities, ${manifest.partitions.reduce((sum, part) => sum + (part?.bytes ?? 0), 0)} compressed binary bytes`)
  } catch (error) { console.error(error); process.exitCode = 1 }
}
