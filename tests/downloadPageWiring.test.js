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
  assert.doesNotMatch(page, /156423069|116 MB/)
  assert.match(page, /bulk release published/)
  assert.match(page, /file.href = entry.url/)
})

test('the route and homepage both point to the download page', () => {
  const pages = read('src/pages/download.astro')
  const home = read('src/views/HomePage.vue')
  const header = read('src/components/organisms/TheHeader.vue')

  assert.match(pages, /DownloadPage/)
  assert.match(home, /<a href="\/download"/)
  assert.match(header, /name:\s*'Download',\s*path:\s*'\/download'/)
})

test('the homepage links the existing download claim itself', () => {
  const home = flatten(read('src/views/HomePage.vue'))

  assert.match(
    home,
    /<a href="\/download"[^>]*>download the data directly<\/a>\./i,
  )
})
