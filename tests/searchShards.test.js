/**
 * The search index's shard manifest, and the order its shards are merged in.
 *
 * The merge order decides FlexSearch's tie order between equally scored
 * results, so it must stay the row order the site searched before the gem
 * sharded the index: deploy.yml's harmonize argument order.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  SEARCH_SHARD_ORDER,
  isSearchIndexManifest,
  orderShards,
} from '../.test-build/utils/searchShards.js'

const shard = (code) => ({ code, file: `${code}.json`, count: 1 })

test('the merge order is deploy.yml\'s harmonize argument order', () => {
  // Read from the workflow itself, so adding a source there without adding
  // it here fails this test instead of quietly appending it last.
  const workflow = readFileSync(
    new URL('../.github/workflows/deploy.yml', import.meta.url),
    'utf8',
  )
  const invocation = workflow.match(/exe\/ammitto harmonize \\\n\s*([a-z_ ]+?)\s*\\\n/)
  assert.ok(invocation, 'deploy.yml must still run `exe/ammitto harmonize <sources>`')
  assert.deepEqual([...SEARCH_SHARD_ORDER], invocation[1].trim().split(/\s+/))
})

test('shards merge in that order, not the manifest\'s alphabetical one', () => {
  const manifestOrder = ['au', 'ch', 'eu', 'uk', 'un', 'us'].map(shard)
  assert.deepEqual(
    orderShards(manifestOrder).map((s) => s.code),
    ['eu', 'un', 'uk', 'au', 'us', 'ch'],
  )
})

test('an authority the order does not know still loads, last, in manifest order', () => {
  assert.deepEqual(
    orderShards(['zz', 'us', 'aa', 'eu'].map(shard)).map((s) => s.code),
    ['eu', 'us', 'zz', 'aa'],
  )
})

test('accepts the manifest the gem writes', () => {
  assert.equal(
    isSearchIndexManifest({
      metadata: { generated: '2026-09-28T14:30:29Z', totalEntities: 2, sources: 2 },
      shards: [shard('au'), shard('eu_vessels')],
    }),
    true,
  )
})

test('refuses a manifest the loader cannot use', () => {
  const metadata = { generated: '', totalEntities: 0, sources: 0 }
  for (const bad of [
    null,
    [],
    { metadata },
    { metadata, shards: [] },
    { shards: [shard('eu')] },
    { metadata, shards: [{ code: 'eu', file: '../stats.json', count: 1 }] },
    { metadata, shards: [{ code: 'eu', file: 'sub/eu.json', count: 1 }] },
    { metadata, shards: [{ code: 'eu', count: 1 }] },
  ]) {
    assert.equal(isSearchIndexManifest(bad), false, JSON.stringify(bad))
  }
})
