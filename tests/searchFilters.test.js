import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterSearchEntities } from '../.test-build/utils/searchFilters.js'

/**
 * One row per shape the filtering has to tell apart: a row on each of three
 * published lists, and a row the producer emitted with no `listType` at all.
 */
const rows = [
  {
    id: 'eu/1',
    type: 'person',
    authority: 'eu',
    regime: 'russia',
    status: 'active',
    country: 'IRAN',
    listType: 'consolidated-list',
  },
  {
    id: 'us/1',
    type: 'organization',
    authority: 'us',
    regime: 'sdn',
    status: 'active',
    country: 'CHINA',
    listType: 'sdn-list',
  },
  {
    id: 'wb/1',
    type: 'organization',
    authority: 'wb',
    regime: 'debarment',
    status: 'delisted',
    listType: 'debarment-list',
  },
  {
    id: 'unplaced/1',
    type: 'person',
    authority: 'cn',
    listType: 'unknown',
  },
  {
    id: 'fieldless/1',
    type: 'person',
    authority: 'un',
  },
]

const idsOf = (result) => result.map((row) => row.id)

test('list-type filtering selects the requested published list', () => {
  assert.deepEqual(
    idsOf(filterSearchEntities(rows, { listTypes: ['sdn-list'] })),
    ['us/1'],
  )
})

test('multiple values within the list facet are alternatives', () => {
  assert.deepEqual(
    idsOf(
      filterSearchEntities(rows, {
        listTypes: ['consolidated-list', 'debarment-list'],
      }),
    ),
    ['eu/1', 'wb/1'],
  )
})

test('list type intersects with the other facet families', () => {
  assert.deepEqual(
    idsOf(
      filterSearchEntities(rows, {
        authorities: ['us'],
        types: ['organization'],
        regimes: ['sdn'],
        statuses: ['active'],
        countries: ['CHINA'],
        listTypes: ['sdn-list'],
      }),
    ),
    ['us/1'],
  )
})

test('an intersection with no common row is empty, not the wider family', () => {
  // Each family alone matches something; together they match nothing. A
  // branch that overwrote `result` instead of narrowing it would return the
  // last family's rows here.
  assert.deepEqual(
    idsOf(
      filterSearchEntities(rows, {
        authorities: ['eu'],
        listTypes: ['sdn-list'],
      }),
    ),
    [],
  )
})

test('the producer\'s "unknown" is selectable in its own right', () => {
  // 'unknown' is a value the producer emits, not a placeholder for absence,
  // so selecting it must return exactly the rows carrying it.
  assert.deepEqual(
    idsOf(filterSearchEntities(rows, { listTypes: ['unknown'] })),
    ['unplaced/1'],
  )
})

test('a row with no listType matches no list selection, including "unknown"', () => {
  // The producer compacts absent fields away, so a fieldless row states
  // nothing about its list. It must not be swept into 'unknown'.
  for (const selection of [['unknown'], ['sdn-list'], ['unknown', 'sdn-list']]) {
    assert.equal(
      idsOf(filterSearchEntities(rows, { listTypes: selection })).includes(
        'fieldless/1',
      ),
      false,
      `a fieldless row must not match ${JSON.stringify(selection)}`,
    )
  }
})

test('an empty or absent list selection filters nothing out', () => {
  assert.deepEqual(idsOf(filterSearchEntities(rows, { listTypes: [] })), idsOf(rows))
  assert.deepEqual(idsOf(filterSearchEntities(rows, {})), idsOf(rows))
})

test('an unmatched list code yields no rows rather than every row', () => {
  assert.deepEqual(filterSearchEntities(rows, { listTypes: ['no-such-list'] }), [])
})

test('the other facet families still filter as they did', () => {
  // The branches moved here out of `useSearchIndex`; this pins that the move
  // preserved them rather than only proving the new one works.
  assert.deepEqual(idsOf(filterSearchEntities(rows, { authorities: ['wb'] })), ['wb/1'])
  assert.deepEqual(idsOf(filterSearchEntities(rows, { types: ['organization'] })), [
    'us/1',
    'wb/1',
  ])
  assert.deepEqual(idsOf(filterSearchEntities(rows, { regimes: ['russia'] })), ['eu/1'])
  assert.deepEqual(idsOf(filterSearchEntities(rows, { statuses: ['delisted'] })), ['wb/1'])
  assert.deepEqual(idsOf(filterSearchEntities(rows, { countries: ['IRAN'] })), ['eu/1'])
})

test('filtering does not mutate the array it was given', () => {
  const input = [...rows]
  filterSearchEntities(input, { listTypes: ['sdn-list'] })
  assert.deepEqual(idsOf(input), idsOf(rows))
})
