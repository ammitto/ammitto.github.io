import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => readFileSync(join(repoRoot, relative), 'utf8')

const templateOf = (source, file) => {
  const start = source.indexOf('<template>')
  const end = source.indexOf('</template>', start)
  assert.ok(start >= 0 && end > start, `${file} must contain a template`)
  return source.slice(start, end).replace(/<!--[\s\S]*?-->/g, '')
}

const vueFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name)
  if (entry.isDirectory()) return vueFiles(path)
  return entry.name.endsWith('.vue') ? [path] : []
})

test('EntityCard renders country and birth date facts', () => {
  const template = templateOf(read('src/components/molecules/EntityCard.vue'), 'EntityCard.vue')
  assert.match(template, /entity\.country/)
  assert.match(template, /entity\.birthDate/)
})

test('EntityCard feeds CountryTile the country code', () => {
  const template = templateOf(read('src/components/molecules/EntityCard.vue'), 'EntityCard.vue')
  const tile = template.match(/<CountryTile\b[\s\S]*?\/>/)?.[0]
  assert.ok(tile, 'EntityCard.vue must render CountryTile')
  assert.doesNotMatch(tile, /sourceInfo\.code/)
  assert.match(tile, /:code="sourceInfo\.country"/)
})

test('templates do not use retired glass-card when CSS does not define it', () => {
  assert.doesNotMatch(read('src/assets/styles/main.css'), /^\s*\.glass-card\b/m)
  for (const file of vueFiles(join(repoRoot, 'src'))) {
    assert.doesNotMatch(
      templateOf(read(file.slice(repoRoot.length + 1)), file),
      /\bglass-card\b/,
      `${file} must use a current surface class`,
    )
  }
})
