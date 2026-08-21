/**
 * The Ruby gem page has to document the gem's actual API.
 *
 * None of what it described existed. Verified by running each call
 * against the gem:
 *
 *   Ammitto::Client.new       -> NoMethodError (Client is a namespace
 *                                module, not a class)
 *   config.base_url =         -> NoMethodError (it is api_base_url)
 *   config.cache_enabled =    -> NoMethodError (no such accessor)
 *
 * and `client.entities`, `client.entity`, `client.stats` were documented
 * in an API-reference table for a client object that cannot be
 * constructed. A reader following that page got an exception on line 3
 * of every example.
 *
 * The real surface is module-level: Ammitto.search / sources /
 * cache_status / refresh_cache / schema / configure, with search
 * returning a ResultSet whose entries are entity objects.
 *
 * These are SUBSTRING AND PATTERN CHECKS OVER SOURCE TEXT — they verify
 * what is written, not what evaluates, for the reason set out at the top
 * of birthWiring.test.js. They pin the calls that were wrong and the
 * shape of the tables. Whether the gem still exposes these methods is a
 * property of the gem and is NOT proved here; re-run the examples
 * against it when this page is next revised.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const page = readFileSync(join(root, 'src/views/RubyGemPage.vue'), 'utf8')

// The samples, not the prose: the comment at the top of the page names
// the wrong calls on purpose, to say what was wrong and why.
const samples = [...page.matchAll(/const \w+Code = `([\s\S]*?)`/g)].map(([, s]) => s)

test('the page carries the three code samples', () => {
  assert.equal(samples.length, 3, 'install, usage and rails samples')
})

test('no sample calls an API the gem does not have', () => {
  const text = samples.join('\n')
  for (const gone of [
    'Ammitto::Client.new',
    'client.entities',
    'client.entity(',
    'client.stats',
    'client.search',
    'config.base_url',
    'config.cache_enabled',
  ]) {
    assert.ok(!text.includes(gone), `${gone} does not exist in the gem`)
  }
})

test('the samples use the module-level API that does exist', () => {
  const text = samples.join('\n')
  for (const real of ['Ammitto.search', 'Ammitto.configure', 'config.api_base_url']) {
    assert.ok(text.includes(real), `expected the page to show ${real}`)
  }
})

test('the reference tables name only real methods', () => {
  // `Ammitto.` prefixed entries in the API table must be methods the
  // module actually defines. This list is the module's public surface.
  const real = new Set([
    'Ammitto.search', 'Ammitto.sources', 'Ammitto.cache_status',
    'Ammitto.refresh_cache', 'Ammitto.schema', 'Ammitto.configure',
    'Ammitto.configuration', 'Ammitto.data_repository',
    'Ammitto.reset_configuration!', 'Ammitto.gem_dir',
  ])
  const listed = [...page.matchAll(/call: '(Ammitto\.[\w?!]+)'/g)].map(([, c]) => c)
  assert.ok(listed.length >= 6, `only ${listed.length} methods documented`)
  for (const c of listed) {
    assert.ok(real.has(c), `${c} is not a method on the Ammitto module`)
  }
})

test('the documented options are options the methods actually read', () => {
  // The reference table's `params` column drifted unchecked: it listed
  // `sources:, force:` for refresh_cache while the implementation also
  // reads `all:`. Pin the exact option sets so the column cannot rot
  // independently of the method names above it.
  const rows = [...page.matchAll(
    /call: '(Ammitto\.[\w?!]+)',\s*\n\s*params: '([^']*)'/g,
  )].map(([, call, params]) => [call, params])

  const expected = {
    // Ammitto.search -> Search::QueryBuilder#initialize reads these three
    'Ammitto.search': ['sources', 'limit', 'offset'],
    // Ammitto.refresh_cache -> Client::CacheManager.refresh reads these three
    'Ammitto.refresh_cache': ['sources', 'all', 'force'],
  }

  for (const [call, opts] of Object.entries(expected)) {
    const row = rows.find(([c]) => c === call)
    assert.ok(row, `${call} is missing from the reference table`)
    const listed = [...row[1].matchAll(/(\w+):/g)].map(([, k]) => k)
    assert.deepEqual(
      listed.sort(), [...opts].sort(),
      `${call} should document exactly ${opts.join(', ')}`,
    )
  }
})

test('printing a name uses display_name, not primary_name', () => {
  // primary_name returns a NameVariant object; printing it yields
  // #<Ammitto::NameVariant:0x...>, which is what the old example did.
  const text = samples.join('\n')
  assert.ok(text.includes('display_name'), 'show display_name for the string')
  assert.ok(
    !/puts[^\n]*\bprimary_name\b/.test(text),
    'primary_name is an object, not a string — do not print it directly',
  )
})
