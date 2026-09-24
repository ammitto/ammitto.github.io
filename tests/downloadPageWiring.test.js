import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => readFileSync(join(root, file), 'utf8')
const flatten = (text) => text.replace(/\s+/g, ' ')

test('the download page exposes both complete formats and source aggregates', () => {
  const page = read('src/views/DownloadPage.vue')

  assert.match(page, /all\.jsonld/)
  assert.match(page, /all\.ttl/)
  assert.match(page, /sources\/\$\{encodeURIComponent\(source\.code\)\}\.jsonld/)
  assert.match(page, /:download="file\.filename"/)
  assert.match(page, /fetch\(`\$\{API_BASE\}\/index\.jsonld`\)/)
  assert.match(page, /fetchableSources/)
  assert.match(page, /156423069/)
  assert.match(page, /116 MB/)
})

test('the route and homepage both point to the download page', () => {
  const router = read('src/router/index.ts')
  const home = read('src/views/HomePage.vue')
  const header = read('src/components/organisms/TheHeader.vue')

  assert.match(router, /path:\s*'\/download'/)
  assert.match(home, /<RouterLink to="\/download"/)
  assert.match(header, /name:\s*'Download',\s*path:\s*'\/download'/)
})

test('the homepage links the existing download claim itself', () => {
  const home = flatten(read('src/views/HomePage.vue'))

  assert.match(
    home,
    /<RouterLink to="\/download"[^>]*>download the data directly<\/RouterLink>\./i,
  )
})
