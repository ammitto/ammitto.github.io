/**
 * The entity page must keep reading the three fields it had been
 * ignoring.
 *
 * `entityFacts.test.js` proves the adapters are right. It cannot prove
 * the page CALLS them: restoring `position: computed(() =>
 * entity.value?.position || null)` and its one-line card leaves every
 * adapter assertion green while the page goes back to showing an empty
 * section to most people who carry a title, no gender at all, and no IMO
 * number on a vessel a reader found BY its IMO number.
 *
 * Closing that by execution would mean running the composable and
 * mounting the view, which needs Vite's SSR loader for their `@/`
 * aliases, `vue` imports and `import.meta.env`. That harness does not
 * exist here and these tests are deliberately dependency-free on plain
 * Node.
 *
 * So the wiring is pinned lexically: each consumer must contain its exact
 * delegating expression and none of the shapes a reverting author would
 * plausibly write. These are SUBSTRING AND PATTERN CHECKS OVER SOURCE
 * TEXT — they verify the call is written, not that it evaluates, and a
 * sufficiently creative rewrite can still slip past. They are a narrow
 * contract, not a behavioural test. If an application-level harness is
 * ever added, replace this file rather than keeping both.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => readFileSync(join(repoRoot, relative), 'utf8')

/** Collapse whitespace so a reformat does not fail the contract. */
const flatten = (source) => source.replace(/\s+/g, ' ')

const COMPOSABLE = 'src/composables/useEntityData.ts'
const ENTITY_PAGE = 'src/views/EntityPage.vue'

test('the composable delegates all three facts to the adapters', () => {
  const source = read(COMPOSABLE)
  const flat = flatten(source)

  assert.match(
    source,
    /^\s*import\s+\{[^}]*\}\s+from\s+'@\/utils\/entityFacts'/m,
    `${COMPOSABLE} must import from '@/utils/entityFacts'`,
  )

  for (const expression of [
    'roleClaims: computed(() => roleClaims(entity.value))',
    'gender: computed(() => statedGender(entity.value))',
    'imoNumber: computed(() => vesselImoNumber(entity.value))',
  ]) {
    assert.ok(
      flat.includes(flatten(expression)),
      `${COMPOSABLE} must contain \`${expression}\``,
    )
  }
})

test('the composable does not go back to exposing position alone', () => {
  // The exact shape this change replaces. It type-checks, it renders, and
  // it drops the title field for every person who carries one.
  const source = read(COMPOSABLE)

  assert.equal(
    /position:\s*computed\(/.test(source),
    false,
    `${COMPOSABLE} must not expose a bare position computed; roleClaims owns both fields`,
  )
  assert.equal(
    /entity\.value\s*\??\.\s*(position|title|gender|imo_number)\b/.test(source),
    false,
    `${COMPOSABLE} must not read a fact field directly; the adapters own them`,
  )
})

test('the entity interface declares the fields the producer publishes', () => {
  // `title` was never declared at all, which is how a published field
  // stayed invisible without anything failing. `imo_number` is the
  // producer's `imoNumber` after normalizeNode.
  const source = read(COMPOSABLE)
  for (const declaration of [/^\s*gender\?:\s*string/m, /^\s*title\?:\s*string/m, /^\s*imo_number\?:\s*string/m]) {
    assert.match(source, declaration, `${COMPOSABLE} must declare ${declaration}`)
  }
})

test('the page binds all three facts from the composable', () => {
  const source = read(ENTITY_PAGE)
  for (const binding of [/^\s*roleClaims,\s*$/m, /^\s*gender,\s*$/m, /^\s*imoNumber,\s*$/m]) {
    assert.match(source, binding, `${ENTITY_PAGE} must destructure ${binding}`)
  }
  assert.equal(
    /^\s*position,\s*$/m.test(source),
    false,
    `${ENTITY_PAGE} must not bind position; roleClaims replaced it`,
  )
})

/**
 * The Position / Title card alone, so a check for a bare `position` read
 * is not confused by a legitimate use elsewhere on the page.
 */
function roleCardMarkup() {
  const source = read(ENTITY_PAGE)
  const start = source.indexOf('<!-- Position / Title -->')
  const end = source.indexOf('<!-- Identifications -->', start)
  assert.notEqual(start, -1, `${ENTITY_PAGE} must keep its <!-- Position / Title --> marker`)
  assert.ok(end > start, `${ENTITY_PAGE} must keep its <!-- Identifications --> marker after it`)
  return source.slice(start, end)
}

test('the role card renders every claim, labelled', () => {
  const flat = flatten(roleCardMarkup())

  // Guarded on the rows, not on one field: guarding on `position` is what
  // left the card empty for a person who states only a title.
  assert.ok(
    flat.includes('v-if="roleClaims.length > 0"'),
    'the card must appear whenever any role field is stated',
  )
  assert.ok(
    flat.includes('v-for="claim in roleClaims"'),
    'the card must render every claim, not the first',
  )
  for (const expression of ['{{ claim.label }}', '{{ claim.value }}']) {
    assert.ok(flat.includes(expression), `the card must render ${expression}`)
  }

  // The heading names both fields, and now the card reads both. Dropping
  // the heading instead of fixing the content would have been the other
  // half of the same defect.
  assert.ok(flat.includes('Position / Title'), 'the heading must keep naming both fields')

  assert.equal(
    /\{\{\s*position\s*\}\}|v-if="position"/.test(flat),
    false,
    'the card must not read position directly again',
  )
})

test('the details grid states gender and the IMO number', () => {
  const source = read(ENTITY_PAGE)
  const start = source.indexOf('<!-- Basic Details -->')
  const end = source.indexOf('<!-- Sanctions Information', start)
  assert.notEqual(start, -1, `${ENTITY_PAGE} must keep its <!-- Basic Details --> marker`)
  assert.ok(end > start, `${ENTITY_PAGE} must keep a marker after the details grid`)
  const flat = flatten(source.slice(start, end))

  // Gender belongs among the identity facts, beside birth information —
  // not in the page header, where a badge next to the person's name would
  // read as the site characterising them rather than quoting a list.
  assert.ok(flat.includes('v-if="gender"'), 'the details grid must state gender when the source does')
  assert.ok(flat.includes('{{ gender }}'), 'the details grid must render the gender value')
  assert.ok(flat.includes('v-if="imoNumber"'), 'the details grid must state a vessel IMO number')
  assert.ok(flat.includes('{{ imoNumber }}'), 'the details grid must render the IMO value')
})

test('gender is not promoted into the page header', () => {
  // A deliberate placement, not an accident of where the markup landed.
  const source = read(ENTITY_PAGE)
  const header = source.slice(source.indexOf('<!-- Header -->'), source.indexOf('<!-- Basic Details -->'))
  assert.equal(
    /gender/i.test(header),
    false,
    'gender is a stated record attribute, shown in the details grid and not as a headline badge',
  )
})

test('the schema page documents the published fields', () => {
  // The site telling API consumers what a node carries. Omitting a
  // published field is the same untruth as documenting one that is never
  // emitted, which is what deadFieldWiring.test.js bans in the other
  // direction.
  const source = read('src/views/SchemaPage.vue')
  for (const field of ['gender', 'title', 'position', 'imoNumber']) {
    assert.ok(source.includes(field), `SchemaPage must name the published ${field} field`)
  }
})

test('the adapters are compiled for the unit tests', () => {
  // A module absent from this list emits nothing, and its test then fails
  // with "module not found" — which reads as a broken import rather than
  // the missing coverage it actually is.
  assert.ok(
    read('tsconfig.test.json').includes('entityFacts.ts'),
    'tsconfig.test.json must include src/utils/entityFacts.ts',
  )
})
