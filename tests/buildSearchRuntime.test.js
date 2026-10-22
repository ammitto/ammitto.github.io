import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createHash, webcrypto } from 'node:crypto'
import { readFile, writeFile, mkdir, mkdtemp, rm, access, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { gunzipSync } from 'node:zlib'
import { prepareSearchRuntime } from '../scripts/build-search-runtime.mjs'

const generated = '2026-01-01T00:00:00Z'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const row = (id, ...names) => ({ id, ref: `cn/${id}`, type: 'person', names })
async function sourceDigest(indexDirectory, orderedCodes) {
  const signatures = await Promise.all(orderedCodes.map(async code =>
    [code, `${code}.json`, hash(await readFile(join(indexDirectory, `${code}.json`)))]))
  return hash(JSON.stringify(signatures))
}
async function chunkBuffer(dist, file) {
  return Uint8Array.from(await readFile(join(dist, 'search-runtime', file))).buffer
}
let helpersPromise
function helpers() {
  return helpersPromise ??= build({
    stdin: { contents: `export * from './searchRuntime.ts';
      export { decodeSearchRuntimeBinary, SEARCH_RUNTIME_PARTITIONS } from './searchRuntimeBinary.ts';
      export { searchRowText } from './birthAdapters.ts';
      export { indexableText } from './searchEncode.ts';`, loader: 'ts',
    resolveDir: new URL('../src/utils/', import.meta.url).pathname },
    bundle: true, write: false, platform: 'node', format: 'esm',
  }).then(result => import(`data:text/javascript;base64,${Buffer.from(`${result.outputFiles[0].text}\n//# sourceURL=search-runtime-fixture-tools.mjs`).toString('base64')}`))
}

async function fixture(run, shards = [
  { code: 'un', entities: [row('a', 'Shared'), row('constructor', 'Constructor')] },
  { code: 'eu', entities: [row('a', 'Shared', 'Old Alias'), row('b', 'Shared')] },
  { code: 'zz', entities: [
    { ...row('c', 'Muḥammad al-Qaida', 'Иван'), primaryName: 'bin Laden', birthYears: [{ type: 'date_range', from: 1970, to: 1972 }] }, row('empty'),
  ] },
]) {
  const dist = await mkdtemp(join(tmpdir(), 'ammitto-search-runtime-test-'))
  const apiRoot = join(dist, 'api/v1')
  const indexDirectory = join(apiRoot, 'search-index')
  const manifest = { metadata: { generated, totalEntities: shards.reduce((sum, shard) => sum + shard.entities.length, 0), sources: shards.length },
    shards: shards.map(shard => ({ code: shard.code, file: `${shard.code}.json`, count: shard.entities.length })) }
  try {
    await mkdir(indexDirectory, { recursive: true })
    await mkdir(join(dist, 'assets'))
    for (const name of ['z-def456.js', 'app-abc123.js', 'style-def456.css']) await writeFile(join(dist, 'assets', name), name)
    await mkdir(join(dist, 'assets', 'nested.js'))
    await writeFile(join(indexDirectory, 'manifest.json'), JSON.stringify(manifest))
    for (const shard of shards) await writeFile(join(indexDirectory, `${shard.code}.json`), JSON.stringify({ entities: shard.entities }))
    await run({ dist, apiRoot, indexDirectory, manifest, shards })
  } finally { await rm(dist, { recursive: true, force: true }) }
}

test('build emits 64 compressed immutable partitions tied to exact source bytes and compiled bundles', async () => {
  await fixture(async ({ dist, apiRoot, indexDirectory }) => {
    const before = await Promise.all((await readdir(indexDirectory)).map(async file => [file, hash(await readFile(join(indexDirectory, file)))]))
    const output = await prepareSearchRuntime(dist, apiRoot)
    const installed = JSON.parse(await readFile(createRequire(import.meta.url).resolve('flexsearch/package.json'), 'utf8'))
    assert.equal(output.engine, installed.version)
    assert.equal(output.format, 'ammitto-search-runtime/v4')
    assert.equal(output.generated, generated)
    assert.equal(output.sourceDigest, await sourceDigest(indexDirectory, ['eu', 'un', 'zz']))
    assert.equal('rowsDigest' in output, false)
    assert.equal(output.rowCount, 6)
    assert.equal(output.entityCount, 5)
    assert.equal(output.registeredCount, 4) // Empty text does not register a document.
    assert.deepEqual(output.bundles, ['app-abc123.js', 'z-def456.js'])
    assert.deepEqual(output.cfg, { doc: 0, opt: 1 })
    assert.deepEqual(output.ctx, [{}])
    const tools = await helpers()
    assert.equal(tools.SEARCH_RUNTIME_PARTITIONS, 64)
    assert.equal(output.partitions.length, 64)
    assert.equal(output.partitionsDigest, hash(JSON.stringify(output.partitions)))
    assert.equal('binary' in output, false)
    const registered = new Set()
    for (const [partition, part] of output.partitions.entries()) {
      if (part === null) continue
      const bytes = await readFile(join(dist, 'search-runtime', part.file))
      assert.equal(part.bytes, bytes.byteLength)
      assert.ok(bytes.byteLength <= 64 * 1024 * 1024)
      assert.equal(part.sha256, hash(bytes))
      assert.equal(part.file, `${hash(bytes)}.bin`)
      assert.deepEqual([...bytes.subarray(0, 2)], [0x1f, 0x8b])
      const raw = gunzipSync(bytes)
      assert.equal(raw.byteLength, part.decodedBytes)
      assert.equal(raw.subarray(0, 8).toString(), 'AMMITTO2')
      const decoded = await tools.decodeSearchRuntimeBinary(Uint8Array.from(raw).buffer, output.entityCount, part.registeredCount, partition)
      for (const id of Object.keys(decoded.register)) registered.add(id)
    }
    assert.equal(registered.size, output.registeredCount)
    assert.deepEqual(JSON.parse(await readFile(join(dist, 'search-runtime/index.json'), 'utf8')), output)
    assert.deepEqual(await prepareSearchRuntime(dist, apiRoot), output, 'repeated generation reuses immutable content')
    for (const [file, digest] of before) assert.equal(hash(await readFile(join(indexDirectory, file))), digest, `preserved API ${file}`)
  })
})

test('generated binary postings round trip through the actual browser importer with duplicate result order and recall', async () => {
  await fixture(async ({ dist, indexDirectory, shards }) => {
    const tools = await helpers()
    const output = await prepareSearchRuntime(dist)
    const ordered = [...shards[1].entities, ...shards[0].entities, ...shards[2].entities]
    const previousCrypto = globalThis.crypto
    if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
    try {
      const fetched = []
      const imported = await tools.importSearchRuntime(output, ordered, generated, 'app-abc123.js', file => {
        fetched.push(file); return chunkBuffer(dist, file)
      },
        await sourceDigest(indexDirectory, ['eu', 'un', 'zz']))
      const original = tools.createSearchIndex()
      for (const entity of ordered) original.add(entity.id, tools.indexableText(tools.searchRowText(entity), entity.primaryName ? [entity.primaryName, ...entity.names] : entity.names))
      assert.deepEqual(imported.ids, ['a', 'b', 'constructor', 'c', 'empty'])
      assert.deepEqual(fetched, [], 'metadata import does not load query partitions')
      await imported.prepare('')
      assert.equal(imported.ready(''), true)
      assert.deepEqual(fetched, [], 'blank query needs no partitions')
      for (const query of ['shared', 'old alias', 'muhammad', 'alqaida', 'al qaida', 'binladen', 'иван', '1970', '1971', '1972', 'constructor', 'constructor absent', 'absent', 'toString']) {
        await imported.prepare(query)
        assert.equal(imported.ready(query), true, query)
        const ids = imported.index.search(query, { limit: 100 }).map(id => imported.ids[Number(id)])
        assert.deepEqual(ids, original.search(query, { limit: 100 }).map(String), query)
      }
      assert.equal(fetched[0], output.partitions['s'.charCodeAt(0) % 64].file)
      assert.deepEqual(imported.index.search('shared').map(id => imported.ids[Number(id)]), ['b', 'a'])
    } finally {
      if (!previousCrypto) delete globalThis.crypto
    }
  })
})

test('blank document text produces empty postings and still imports a complete empty index', async () => {
  await fixture(async ({ dist, indexDirectory, shards }) => {
    const output = await prepareSearchRuntime(dist)
    assert.equal(output.registeredCount, 0)
    assert.equal(output.partitions.length, 64)
    assert.ok(output.partitions.every(part => part === null))
    assert.deepEqual(await readdir(join(dist, 'search-runtime')),
      [...new Set([output.fast.ids, output.fast.columns, ...output.fast.rows].map(asset => asset.file)), 'index.json'].sort())
    const tools = await helpers()
    const previousCrypto = globalThis.crypto
    if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
    try {
      const imported = await tools.importSearchRuntime(output, shards[0].entities, generated, 'app-abc123.js', () => { throw new Error('Empty index must not fetch') },
        await sourceDigest(indexDirectory, ['cn']))
      await imported.prepare('')
      await imported.prepare('constructor')
      assert.equal(imported.ready('constructor'), true)
      assert.deepEqual(imported.index.search('constructor'), [])
    } finally { if (!previousCrypto) delete globalThis.crypto }
  }, [{ code: 'cn', entities: [row('empty')] }])
})

test('source fingerprint binds raw shard bytes even when decoded rows are unchanged', async () => {
  await fixture(async ({ dist, indexDirectory }) => {
    const first = await prepareSearchRuntime(dist)
    const shardPath = join(indexDirectory, 'eu.json')
    const original = await readFile(shardPath, 'utf8')
    await writeFile(shardPath, `${original}\n`)
    const second = await prepareSearchRuntime(dist)
    assert.notEqual(second.sourceDigest, first.sourceDigest)
    assert.equal(second.sourceDigest, await sourceDigest(indexDirectory, ['eu', 'un', 'zz']))
    assert.equal(second.rowCount, first.rowCount)
    assert.equal(second.entityCount, first.entityCount)
    assert.deepEqual(second.partitions, first.partitions)
    assert.equal(second.partitionsDigest, first.partitionsDigest)
  })
})

test('a corrupt existing content-addressed chunk fails without publishing another manifest', async () => {
  await fixture(async ({ dist }) => {
    const output = await prepareSearchRuntime(dist)
    const manifestPath = join(dist, 'search-runtime/index.json')
    const originalManifest = await readFile(manifestPath, 'utf8')
    const chunkPath = join(dist, 'search-runtime', output.partitions.find(Boolean).file)
    await writeFile(chunkPath, 'corrupt fixture content')
    await assert.rejects(prepareSearchRuntime(dist), /asset is corrupt/)
    assert.equal(await readFile(manifestPath, 'utf8'), originalManifest)
    assert.equal(await readFile(chunkPath, 'utf8'), 'corrupt fixture content')
  })
})

for (const [name, mutate] of Object.entries({
  metadata: async ({ manifest }) => { manifest.metadata.generated = 'impossible' },
  total: async ({ manifest }) => { manifest.metadata.totalEntities++ },
  duplicate: async ({ manifest }) => { manifest.shards[1].file = manifest.shards[0].file },
  traversal: async ({ manifest }) => { manifest.shards[0].file = '../other.json' },
  count: async ({ manifest }) => { manifest.shards[0].count = 0 },
  missing: async ({ manifest }) => { manifest.shards[0].file = 'missing.json' },
  rows: async ({ indexDirectory }) => { await writeFile(join(indexDirectory, 'un.json'), JSON.stringify({ entities: [row('', 'Bad'), row('other')] })) },
  names: async ({ indexDirectory }) => { await writeFile(join(indexDirectory, 'un.json'), JSON.stringify({ entities: [{ ...row('a'), names: [1] }, row('other')] })) },
  primaryName: async ({ indexDirectory }) => { await writeFile(join(indexDirectory, 'un.json'), JSON.stringify({ entities: [{ ...row('a'), primaryName: 1 }, row('other')] })) },
  short: async ({ indexDirectory }) => { await writeFile(join(indexDirectory, 'un.json'), JSON.stringify({ entities: [] })) },
})) test(`rejects ${name} source input before writing a runtime manifest`, async () => {
  await fixture(async context => {
    await mutate(context)
    await writeFile(join(context.indexDirectory, 'manifest.json'), JSON.stringify(context.manifest))
    await assert.rejects(prepareSearchRuntime(context.dist))
    await assert.rejects(access(join(context.dist, 'search-runtime/index.json')))
  })
})

test('build command generates the runtime after the real Vite build', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.match(packageJson.scripts.build, /vite-ssg build && node scripts\/build-search-runtime\.mjs dist$/)
})
