import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createHash, webcrypto } from 'node:crypto'
import { readFile, writeFile, mkdir, mkdtemp, rm, access, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { prepareSearchRuntime, partitionSearchRuntimeDictionary } from '../scripts/build-search-runtime.mjs'

const generated = '2026-01-01T00:00:00Z'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const row = (id, ...names) => ({ id, ref: `cn/${id}`, type: 'person', names })
let helpersPromise
function helpers() {
  return helpersPromise ??= build({
    stdin: { contents: `export * from './searchRuntime.ts';
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

test('build emits bounded immutable chunks tied to exact ordered rows and compiled bundles', async () => {
  await fixture(async ({ dist, apiRoot, indexDirectory, shards }) => {
    const before = await Promise.all((await readdir(indexDirectory)).map(async file => [file, hash(await readFile(join(indexDirectory, file)))]))
    const output = await prepareSearchRuntime(dist, apiRoot)
    const installed = JSON.parse(await readFile(createRequire(import.meta.url).resolve('flexsearch/package.json'), 'utf8'))
    assert.equal(output.engine, installed.version)
    assert.equal(output.format, 'ammitto-search-runtime/v1')
    assert.equal(output.generated, generated)
    const ordered = [...shards[1].entities, ...shards[0].entities, ...shards[2].entities]
    assert.equal(output.rowsDigest, hash(JSON.stringify(ordered)))
    assert.equal(output.rowCount, 6)
    assert.equal(output.entityCount, 5)
    assert.equal(output.registeredCount, 4) // Empty text does not register a document.
    assert.deepEqual(output.bundles, ['app-abc123.js', 'z-def456.js'])
    assert.deepEqual(output.cfg, { doc: 0, opt: 1 })
    assert.deepEqual(output.ctx, [{}])
    for (const chunk of output.chunks) {
      const bytes = await readFile(join(dist, 'search-runtime', chunk.file))
      assert.equal(chunk.bytes, bytes.byteLength)
      assert.ok(chunk.bytes <= 1024 * 1024)
      assert.equal(chunk.sha256, hash(bytes))
      assert.equal(chunk.file, `${chunk.sha256}.json`)
      assert.ok(Object.keys(JSON.parse(bytes)).length > 0)
      assert.ok(chunk.kind === 'reg' || (chunk.kind === 'map' && chunk.score >= 0 && chunk.score <= 8))
    }
    assert.deepEqual(JSON.parse(await readFile(join(dist, 'search-runtime/index.json'), 'utf8')), output)
    assert.deepEqual(await prepareSearchRuntime(dist, apiRoot), output, 'repeated generation reuses immutable content')
    for (const [file, digest] of before) assert.equal(hash(await readFile(join(indexDirectory, file))), digest, `preserved API ${file}`)
  })
})

test('generated chunks round trip through the actual browser importer with duplicate result order and recall', async () => {
  await fixture(async ({ dist, shards }) => {
    const tools = await helpers()
    const output = await prepareSearchRuntime(dist)
    const ordered = [...shards[1].entities, ...shards[0].entities, ...shards[2].entities]
    const previousCrypto = globalThis.crypto
    if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
    try {
      const imported = await tools.importSearchRuntime(output, ordered, generated, 'app-abc123.js', file => readFile(join(dist, 'search-runtime', file), 'utf8'))
      const original = tools.createSearchIndex()
      for (const entity of ordered) original.add(entity.id, tools.indexableText(tools.searchRowText(entity), entity.primaryName ? [entity.primaryName, ...entity.names] : entity.names))
      assert.deepEqual(imported.ids, ['a', 'b', 'constructor', 'c', 'empty'])
      for (const query of ['shared', 'old alias', 'muhammad', 'alqaida', 'al qaida', 'binladen', 'иван', '1970', '1971', '1972', 'constructor', 'constructor absent', 'absent', 'toString']) {
        const ids = imported.index.search(query, { limit: 100 }).map(id => imported.ids[Number(id)])
        assert.deepEqual(ids, original.search(query, { limit: 100 }).map(String), query)
      }
      assert.deepEqual(imported.index.search('shared').map(id => imported.ids[Number(id)]), ['b', 'a'])
    } finally {
      if (!previousCrypto) delete globalThis.crypto
    }
  })
})

test('blank document text produces zero chunks and still imports a complete empty index', async () => {
  await fixture(async ({ dist, shards }) => {
    const output = await prepareSearchRuntime(dist)
    assert.equal(output.registeredCount, 0)
    assert.deepEqual(output.chunks, [])
    const tools = await helpers()
    const previousCrypto = globalThis.crypto
    if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
    try {
      const imported = await tools.importSearchRuntime(output, shards[0].entities, generated, 'app-abc123.js', () => { throw new Error('No chunk fetch expected') })
      assert.deepEqual(imported.index.search('constructor'), [])
    } finally { if (!previousCrypto) delete globalThis.crypto }
  }, [{ code: 'cn', entities: [row('empty')] }])
})

test('a corrupt existing content-addressed chunk fails without publishing another manifest', async () => {
  await fixture(async ({ dist }) => {
    const output = await prepareSearchRuntime(dist)
    const manifestPath = join(dist, 'search-runtime/index.json')
    const originalManifest = await readFile(manifestPath, 'utf8')
    const chunkPath = join(dist, 'search-runtime', output.chunks[0].file)
    await writeFile(chunkPath, 'corrupt fixture content')
    await assert.rejects(prepareSearchRuntime(dist), /chunk is corrupt/)
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

test('dictionary chunks bound UTF-8 parsing work and reject an indivisible entry over 1 MiB', () => {
  const dictionary = { ['é'.repeat(75_000)]: [0], ['ø'.repeat(75_000)]: [1] }
  const chunks = partitionSearchRuntimeDictionary(dictionary, 'map', 2)
  assert.equal(chunks.length, 2)
  const reconstructed = Object.assign({}, ...chunks.map(chunk => JSON.parse(chunk.text)))
  assert.deepEqual(reconstructed, dictionary)
  for (const chunk of chunks) {
    assert.equal(chunk.descriptor.bytes, Buffer.byteLength(chunk.text))
    assert.ok(chunk.descriptor.bytes <= 256 * 1024)
    assert.equal(chunk.descriptor.sha256, hash(chunk.text))
  }
  const largePosting = partitionSearchRuntimeDictionary({ shared: Array(90_000).fill(12345) }, 'map', 0)
  assert.equal(largePosting.length, 1)
  assert.ok(largePosting[0].descriptor.bytes > 256 * 1024)
  assert.ok(largePosting[0].descriptor.bytes <= 1024 * 1024)
  assert.throws(() => partitionSearchRuntimeDictionary({ shared: Array(200_000).fill(12345) }, 'map', 0), /exceeds 1 MiB/)
  assert.deepEqual(partitionSearchRuntimeDictionary({}, 'reg'), [])
})
