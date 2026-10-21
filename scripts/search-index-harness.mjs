// Development-only harness: execute the actual browser composable under Node.
// Network transport and rendering are excluded; Vue and FlexSearch are real.
import { build } from 'esbuild'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export async function searchIndexHarness(source, run) {
  // Resolve from the script URL on the project's Node 20 baseline too.
  const repository = new URL('../', import.meta.url)
  const outputRoot = new URL('.test-build/', repository)
  await mkdir(outputRoot, { recursive: true })
  const directory = await mkdtemp(join(outputRoot.pathname, 'search-performance-'))
  const previousWindow = globalThis.window
  const previousFetch = globalThis.fetch
  try {
    const result = await build({
      stdin: { contents: source, loader: 'ts', resolveDir: new URL('src/composables/', repository).pathname },
      bundle: true, write: false, platform: 'node', format: 'esm', packages: 'external',
      alias: { '@': new URL('src/', repository).pathname },
      define: { 'import.meta.env.BASE_URL': JSON.stringify('/') },
    })
    const modulePath = join(directory, 'composable.mjs')
    await writeFile(modulePath, result.outputFiles[0].text)
    globalThis.window = {}
    const api = (await import(pathToFileURL(modulePath).href)).useSearchIndex()
    await run(api)
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
    globalThis.fetch = previousFetch
    await rm(directory, { recursive: true, force: true })
  }
}

export function searchResponses(rows) {
  return async (url) => ({
    ok: true,
    async arrayBuffer() {
      return new TextEncoder().encode(JSON.stringify({ entities: rows })).buffer
    },
    async json() {
      if (String(url).endsWith('manifest.json')) {
        return {
          metadata: { generated: '2026-01-01T00:00:00Z', totalEntities: rows.length, sources: 1 },
          shards: [{ code: 'cn', file: 'cn.json', count: rows.length }],
        }
      }
      return { entities: rows }
    },
  })
}
