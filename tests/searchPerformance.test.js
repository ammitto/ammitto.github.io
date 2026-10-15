import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { computed } from 'vue'
import { searchIndexHarness, searchResponses } from '../scripts/search-index-harness.mjs'

const source = await readFile(new URL('../src/composables/useSearchIndex.ts', import.meta.url), 'utf8')
const row = (id, name, type = 'person') => ({
  id, ref: `cn/${id}`, type, names: [name], primaryName: name,
  authority: 'cn', status: 'active', country: 'CN',
})

test('real search composable preserves readiness, completed observers and result semantics', async () => {
  await searchIndexHarness(source, async (api) => {
    const rows = [row('one', 'Al-Qaida'), row('two', 'Islámský stát', 'organization'), row('three', 'Other')]
    let release
    const responses = searchResponses(rows)
    globalThis.fetch = async (url) => {
      if (String(url).endsWith('cn.json')) await new Promise(resolve => { release = resolve })
      return responses(url)
    }
    const visibleRows = computed(() => [...api.entities.value.values()])
    assert.equal(visibleRows.value.length, 0)
    const loading = api.loadSearchIndex()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(api.isLoading.value, true)
    assert.equal(api.isLoaded.value, false)
    assert.deepEqual(api.search('alqaida'), [])
    release()
    await loading
    assert.equal(api.isLoaded.value, true)
    assert.equal(api.isLoading.value, false)
    assert.equal(api.error.value, null)
    assert.equal(visibleRows.value.length, 3)
    assert.deepEqual(api.search('alqaida').map(item => item.id), ['one'])
    assert.deepEqual(api.search('islamsky').map(item => item.id), ['two'])
    assert.deepEqual(api.search('', 2).map(item => item.id), ['one', 'two'])
    assert.equal(api.getEntityByRef('cn/two').id, 'two')
    assert.equal(api.getEntity('missing'), undefined)
    assert.deepEqual(api.searchPartial('Other'), [])
    const calls = []
    globalThis.fetch = async (url) => { calls.push(url); throw new Error('unexpected reload') }
    await api.loadSearchIndex()
    assert.deepEqual(calls, [])
  })
})

test('real search composable retains last-row-wins duplicate semantics', async () => {
  await searchIndexHarness(source, async (api) => {
    globalThis.fetch = searchResponses([row('same', 'Oldword'), row('same', 'Newword'), row('unique', 'Newword')])
    await api.loadSearchIndex()
    assert.equal(api.entities.value.size, 2)
    assert.equal(api.getEntity('same').primaryName, 'Newword')
    assert.deepEqual(api.search('Oldword'), [])
    assert.deepEqual(api.search('Newword').map(item => item.id), ['same', 'unique'])
  })
})
