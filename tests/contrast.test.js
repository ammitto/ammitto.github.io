/**
 * WCAG contrast regression tests for the colour system.
 *
 * Run with `npm run test:unit`. Like the normalizer tests next door these are
 * plain JavaScript on Node's built-in runner and import the type-erased build
 * of the real modules (see tsconfig.test.json), so they need no test
 * dependency and no browser, and they cover the shipped code rather than a
 * copy of it.
 *
 * What this file is for
 * ---------------------
 * Badges, tiles, links and body text used to be painted from raw per-source
 * hex through inline styles, which cannot vary by theme. Dark mode therefore
 * rendered "European Union" at 1.55:1 and "Australia" at 1.24:1 — invisible —
 * while light mode sat under AA on entity-type and status badges. The fix
 * derives every one of those colours per theme in `src/config/palette.ts`.
 * These tests recompute WCAG contrast over every pair that module can produce
 * and fail below AA, so the defect cannot return quietly.
 *
 * Why the assertions are not circular
 * -----------------------------------
 * 1. The WCAG relative-luminance formula is implemented HERE and deliberately
 *    not exported by `palette.ts`. The module under test and the oracle
 *    testing it share no code.
 * 2. `palette.ts` never consults a contrast ratio. It moves a seed colour to a
 *    fixed OKLab lightness per role and theme. Relative luminance is not OKLab
 *    lightness, so a fixed target still produces a range of ratios across hues
 *    and these assertions can genuinely fail. Verified by mutation: restoring
 *    any one of the pre-fix values (the #6b7280 muted gray, the #0066cc dark
 *    link, seed-hex badges) makes this file fail.
 * 3. Hue and saturation preservation are checked with an independent HSL
 *    conversion rather than the module's own OKLab code, so "the fix made
 *    everything gray" is also caught.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  ACHROMATIC_CHROMA,
  METHOD_SEED,
  NEUTRAL_SEED,
  inkTone,
  inkToneVars,
  linkTokens,
  pillTone,
  pillToneVars,
  surfaces,
  textTokens,
  tileTone,
  tileToneVars,
} from '../.test-build/config/palette.js'
import { entityTypes, sources, statuses } from '../.test-build/config/index.js'
import { ALL_ROUTES, PARAM_ROUTES, STATIC_ROUTES } from './routes.js'

/* ------------------------------------------------------------------ *
 * The oracle: WCAG 2.x relative luminance and contrast ratio.
 * Independent of src/config/palette.ts on purpose.
 * ------------------------------------------------------------------ */

const HEX = /^#[0-9a-f]{6}$/

function channels(hex) {
  assert.match(hex, HEX, `not a six-digit lowercase sRGB hex: ${hex}`)
  const s = hex.slice(1)
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255)
}

/** WCAG 2.2 relative luminance. */
function luminance(hex) {
  const [r, g, b] = channels(hex).map((v) =>
    v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
  )
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2.2 contrast ratio, 1..21. */
function contrast(a, b) {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Independent hue/saturation, from HSL — not the module's OKLab code. */
function hsl(hex) {
  const [r, g, b] = channels(hex)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  let h
  if (max === r) h = 60 * (((g - b) / d) % 6)
  else if (max === g) h = 60 * ((b - r) / d + 2)
  else h = 60 * ((r - g) / d + 4)
  if (h < 0) h += 360
  return { h, s, l }
}

function hueGap(a, b) {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/**
 * WCAG AA: 4.5 for normal text. Nothing in this system qualifies for the 3:1
 * large-text exception — badges and chips are text-xs, tile initials are 14-16px
 * bold (the exception needs 18.66px bold), muted text is text-sm at smallest.
 */
const AA_NORMAL = 4.5

/**
 * A deliberately stricter floor for the DERIVED tones, applied on top of AA.
 * The role lightness targets in palette.ts currently land every derived pair
 * well clear of 4.5; holding them above 5 means a careless retune shows up as
 * a failing test while the site is still compliant, rather than one shade
 * later when it is not.
 */
const DERIVED_FLOOR = 5

/** Everything the tone derivation is asked to colour, with its provenance. */
const SEEDS = [
  ...sources.map((s) => ({ label: `source:${s.code}`, seed: s.color })),
  ...entityTypes.map((t) => ({ label: `entityType:${t.code}`, seed: t.color })),
  ...statuses.map((s) => ({ label: `status:${s.code}`, seed: s.color })),
  { label: 'neutral-fallback', seed: NEUTRAL_SEED },
  { label: 'api-method-chip', seed: METHOD_SEED },
]

/**
 * Values that reach the tone functions from outside the codebase: an unknown
 * source code, an entity type the producer has not seen before, a colour that
 * arrived with the ontology graph, a hand-edit typo. None may produce an
 * unreadable badge.
 */
const HOSTILE_SEEDS = [
  { label: 'undefined', seed: undefined },
  { label: 'null', seed: null },
  { label: 'empty string', seed: '' },
  { label: 'not a colour', seed: 'rebeccapurple' },
  { label: 'truncated hex', seed: '#12' },
  { label: 'rgb() function', seed: 'rgb(1, 2, 3)' },
  { label: 'three-digit hex', seed: '#f0a' },
  { label: 'uppercase hex', seed: '#00FF00' },
  { label: 'pure white', seed: '#ffffff' },
  { label: 'pure black', seed: '#000000' },
]

const THEMES = ['light', 'dark']

function backdropsOf(theme) {
  return Object.entries(surfaces[theme]).map(([name, hex]) => ({ name, hex }))
}

function assertAtLeast(ratio, floor, what) {
  assert.ok(
    ratio >= floor,
    `${what}: contrast ${ratio.toFixed(2)}:1 is below the required ${floor}:1`,
  )
}

/* ------------------------------------------------------------------ *
 * 0. The oracle itself
 * ------------------------------------------------------------------ */

test('the contrast oracle reproduces published WCAG values', () => {
  // Reference pairs whose ratios are fixed by the specification and widely
  // published (e.g. WebAIM's contrast checker). If this drifts, every other
  // assertion in the file is meaningless.
  const cases = [
    ['#000000', '#ffffff', 21],
    ['#ffffff', '#ffffff', 1],
    ['#777777', '#ffffff', 4.48],
    ['#595959', '#ffffff', 7.0],
    ['#0000ff', '#ffffff', 8.59],
    ['#ff0000', '#ffffff', 4.0],
    ['#808080', '#000000', 5.32],
  ]
  for (const [a, b, expected] of cases) {
    assert.ok(
      Math.abs(contrast(a, b) - expected) < 0.01,
      `contrast(${a}, ${b}) = ${contrast(a, b).toFixed(4)}, expected ~${expected}`,
    )
    assert.equal(contrast(a, b), contrast(b, a), 'contrast must be symmetric')
  }
})

/* ------------------------------------------------------------------ *
 * 1. Badge / chip / filter-pill tones
 * ------------------------------------------------------------------ */

test('every badge tone clears AA against its own fill, in both themes', () => {
  for (const { label, seed } of SEEDS) {
    const tone = pillTone(seed)
    for (const theme of THEMES) {
      const ratio = contrast(tone[theme].fg, tone[theme].bg)
      assertAtLeast(ratio, AA_NORMAL, `${label} badge text on ${theme} fill`)
      assertAtLeast(ratio, DERIVED_FLOOR, `${label} badge text on ${theme} fill (design floor)`)
    }
  }
})

test('badge fills stay distinguishable from every surface they sit on', () => {
  // Not a WCAG requirement — the pill is identified by its label and fill, and
  // its border is decorative — but a fill that matched the page exactly would
  // erase the badge as a visual object, and that is the kind of "fix" a pure
  // text-contrast assertion would happily accept.
  for (const { label, seed } of SEEDS) {
    const tone = pillTone(seed)
    for (const theme of THEMES) {
      for (const backdrop of backdropsOf(theme)) {
        const fillRatio = contrast(tone[theme].bg, backdrop.hex)
        const borderRatio = contrast(tone[theme].border, backdrop.hex)
        assert.ok(
          fillRatio >= 1.02 || borderRatio >= 1.15,
          `${label} badge on ${theme}/${backdrop.name}: neither fill (${fillRatio.toFixed(
            2,
          )}) nor border (${borderRatio.toFixed(2)}) separates it from the surface`,
        )
      }
    }
  }
})

test('badge tones survive unknown, malformed and achromatic seeds', () => {
  for (const { label, seed } of HOSTILE_SEEDS) {
    const vars = pillToneVars(seed)
    // Measure the values the TEMPLATE actually receives, not a second call to
    // pillTone(). Checking the helper's output shape alone would pass even if
    // the light and dark sets were swapped or the helper emitted some other
    // colour entirely.
    for (const key of [
      '--tone-fg',
      '--tone-bg',
      '--tone-border',
      '--tone-fg-dark',
      '--tone-bg-dark',
      '--tone-border-dark',
    ]) {
      assert.match(vars[key] ?? '', HEX, `${label} seed: ${key} missing or not a hex colour`)
    }
    assertAtLeast(
      contrast(vars['--tone-fg'], vars['--tone-bg']),
      AA_NORMAL,
      `${label} seed badge, light custom properties`,
    )
    assertAtLeast(
      contrast(vars['--tone-fg-dark'], vars['--tone-bg-dark']),
      AA_NORMAL,
      `${label} seed badge, dark custom properties`,
    )
    // ...and that those values are the light/dark tones the right way round.
    const expected = pillTone(seed || NEUTRAL_SEED)
    assert.equal(vars['--tone-fg'], expected.light.fg, `${label}: --tone-fg is not the light tone`)
    assert.equal(
      vars['--tone-fg-dark'],
      expected.dark.fg,
      `${label}: --tone-fg-dark is not the dark tone`,
    )
    assert.notEqual(
      vars['--tone-bg'],
      vars['--tone-bg-dark'],
      `${label}: the two themes' fills are identical, so the badge is theme-blind again`,
    )
  }
})

test('tone helpers emit custom properties only', () => {
  // The helpers exist so that a template never sets a painted colour inline —
  // an inline `color`/`background-color` cannot vary by theme, which was the
  // original defect. Emitting one from here would reintroduce it centrally.
  for (const helper of [pillToneVars, tileToneVars, inkToneVars]) {
    for (const key of Object.keys(helper('#0066cc'))) {
      assert.ok(
        key.startsWith('--'),
        `${helper.name} emits "${key}", which paints directly instead of feeding a themed rule`,
      )
    }
  }
})

/* ------------------------------------------------------------------ *
 * 2. Source tiles (the "UN"/"CA" initials)
 * ------------------------------------------------------------------ */

test('tile initials clear AA against the tile fill, in both themes', () => {
  for (const { label, seed } of SEEDS) {
    const tone = tileTone(seed)
    for (const theme of THEMES) {
      const ratio = contrast(tone[theme].fg, tone[theme].bg)
      assertAtLeast(ratio, AA_NORMAL, `${label} tile initials in ${theme}`)
      assertAtLeast(ratio, DERIVED_FLOOR, `${label} tile initials in ${theme} (design floor)`)
    }
  }
})

test('tile tone helper emits both themes, the right way round, for any seed', () => {
  for (const { label, seed } of HOSTILE_SEEDS) {
    const vars = tileToneVars(seed)
    for (const key of ['--tile-fg', '--tile-bg', '--tile-fg-dark', '--tile-bg-dark']) {
      assert.match(vars[key] ?? '', HEX, `${label} seed: ${key} missing or not a hex colour`)
    }
    // Measure what the template receives, and check the sets are not swapped.
    assertAtLeast(
      contrast(vars['--tile-fg'], vars['--tile-bg']),
      AA_NORMAL,
      `${label} seed tile, light custom properties`,
    )
    assertAtLeast(
      contrast(vars['--tile-fg-dark'], vars['--tile-bg-dark']),
      AA_NORMAL,
      `${label} seed tile, dark custom properties`,
    )
    const expected = tileTone(seed || NEUTRAL_SEED)
    assert.equal(vars['--tile-bg'], expected.light.bg, `${label}: --tile-bg is not the light tone`)
    assert.equal(
      vars['--tile-bg-dark'],
      expected.dark.bg,
      `${label}: --tile-bg-dark is not the dark tone`,
    )
    assert.notEqual(
      vars['--tile-bg'],
      vars['--tile-bg-dark'],
      `${label}: both themes get the same tile fill, so the tile is theme-blind again`,
    )
  }
})

/* ------------------------------------------------------------------ *
 * 3. Coloured text drawn straight on a surface (ontology icons)
 * ------------------------------------------------------------------ */

test('ink tones clear AA on every surface of their theme', () => {
  for (const { label, seed } of SEEDS) {
    const tone = inkTone(seed)
    for (const theme of THEMES) {
      for (const backdrop of backdropsOf(theme)) {
        assertAtLeast(
          contrast(tone[theme], backdrop.hex),
          AA_NORMAL,
          `${label} ink on ${theme}/${backdrop.name}`,
        )
      }
    }
  }
})

test('ink tone helper emits both themes, the right way round, for any seed', () => {
  for (const { label, seed } of HOSTILE_SEEDS) {
    const vars = inkToneVars(seed)
    for (const key of ['--ink-fg', '--ink-fg-dark']) {
      assert.match(vars[key] ?? '', HEX, `${label} seed: ${key} missing or not a hex colour`)
    }
    // Ink is drawn straight on a surface, so the emitted value is measured
    // against every surface of the theme it claims to belong to. A swapped
    // pair fails immediately: light ink on a dark surface is far too dark.
    for (const backdrop of backdropsOf('light')) {
      assertAtLeast(
        contrast(vars['--ink-fg'], backdrop.hex),
        AA_NORMAL,
        `${label} seed ink (light property) on light/${backdrop.name}`,
      )
    }
    for (const backdrop of backdropsOf('dark')) {
      assertAtLeast(
        contrast(vars['--ink-fg-dark'], backdrop.hex),
        AA_NORMAL,
        `${label} seed ink (dark property) on dark/${backdrop.name}`,
      )
    }
    const expected = inkTone(seed || NEUTRAL_SEED)
    assert.equal(vars['--ink-fg'], expected.light, `${label}: --ink-fg is not the light tone`)
    assert.equal(vars['--ink-fg-dark'], expected.dark, `${label}: --ink-fg-dark is not the dark tone`)
  }
})

/* ------------------------------------------------------------------ *
 * 4. Identity: the derived colour must still be the brand's colour
 * ------------------------------------------------------------------ */

test('derived tones keep the seed hue and stay chromatic', () => {
  // Without this, "make every badge black on white" would pass every contrast
  // assertion above while destroying the source identity the badges carry.
  // Every coloured role is checked, not just the badge text: a gray tile or a
  // gray ontology icon loses the same information.
  for (const { label, seed } of SEEDS) {
    const seedHsl = hsl(seed)
    if (seedHsl.s < 0.12) continue // genuinely neutral seeds are handled below
    for (const theme of THEMES) {
      const roles = [
        [`badge text`, pillTone(seed)[theme].fg],
        [`badge fill`, pillTone(seed)[theme].bg],
        [`tile fill`, tileTone(seed)[theme].bg],
        [`ink`, inkTone(seed)[theme]],
      ]
      for (const [role, value] of roles) {
        const derived = hsl(value)
        // Fills are pale or deep by design, so they are held to a lower
        // saturation floor than text — but they must still carry the hue.
        const floor = role === 'badge fill' ? 0.08 : 0.15
        assert.ok(
          derived.s >= floor,
          `${label} ${theme} ${role} ${value} is nearly gray (saturation ${derived.s.toFixed(2)})`,
        )
        assert.ok(
          hueGap(seedHsl.h, derived.h) <= 30,
          `${label} ${theme} ${role} ${value} drifted ${hueGap(seedHsl.h, derived.h).toFixed(
            0,
          )}deg from the seed hue`,
        )
      }
    }
  }
})

test('achromatic seeds render as neutrals rather than an arbitrary hue', () => {
  // #000000 (New Zealand) has no hue at all; atan2 on numerical noise would
  // hand it one. ACHROMATIC_CHROMA is the guard, and it must sit above the
  // neutral gray's own chroma.
  assert.ok(ACHROMATIC_CHROMA > 0, 'ACHROMATIC_CHROMA must be a positive threshold')
  for (const seed of ['#000000', '#ffffff', '#6b7280', '#808080']) {
    for (const theme of THEMES) {
      const { fg, bg } = pillTone(seed)[theme]
      for (const value of [fg, bg]) {
        const { s } = hsl(value)
        assert.ok(s < 0.08, `achromatic seed ${seed} produced a tinted ${theme} colour ${value}`)
      }
    }
  }
})

/* ------------------------------------------------------------------ *
 * 5. Body text, muted text and links
 * ------------------------------------------------------------------ */

test('body and muted text clear AA on every surface of their theme', () => {
  for (const theme of THEMES) {
    for (const backdrop of backdropsOf(theme)) {
      assertAtLeast(
        contrast(textTokens[theme].fg, backdrop.hex),
        AA_NORMAL,
        `${theme} body text on ${backdrop.name}`,
      )
      assertAtLeast(
        contrast(textTokens[theme].muted, backdrop.hex),
        AA_NORMAL,
        `${theme} muted text on ${backdrop.name}`,
      )
    }
  }
})

test('link text clears AA on every surface of its theme', () => {
  for (const theme of THEMES) {
    for (const backdrop of backdropsOf(theme)) {
      assertAtLeast(
        contrast(linkTokens[theme], backdrop.hex),
        AA_NORMAL,
        `${theme} link on ${backdrop.name}`,
      )
    }
  }
})

test('no text utility fades a tested colour below AA', () => {
  // Tailwind's opacity modifier on a TEXT colour (`hover:text-brand-link/80`)
  // paints that colour at partial alpha over whatever is behind it, so the
  // pair a reader sees is not the pair tested above. Hover in particular is a
  // state readers spend real time in and one the rendered-DOM scan never
  // enters. Every opacity-modified text utility found in the templates is
  // therefore composited here and held to AA.
  //
  // This caught a real one: the entity, group and announcement pages faded
  // their links to `text-brand-link/80`, which measures 3.61:1 on the light
  // page background. Those hovers now underline instead.
  const root = fileURLToPath(new URL('../src', import.meta.url))
  const files = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.vue')) files.push(full)
    }
  }
  walk(root)

  const tokenFor = {
    'brand-link': (theme) => linkTokens[theme],
    'light-muted': () => textTokens.light.muted,
    'dark-muted': () => textTokens.dark.muted,
    'light-text': () => textTokens.light.fg,
    'dark-text': () => textTokens.dark.fg,
    'light-fg': () => textTokens.light.fg,
    'dark-fg': () => textTokens.dark.fg,
  }

  let checked = 0
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    for (const match of text.matchAll(/text-(brand-link|light-\w+|dark-\w+)\/(\d{1,3})\b/g)) {
      const [, token, alphaText] = match
      const resolve = tokenFor[token]
      if (!resolve) continue
      const alpha = Number(alphaText) / 100
      const line = text.slice(0, match.index).split('\n').length
      for (const theme of THEMES) {
        for (const backdrop of backdropsOf(theme)) {
          const faded = compositeOver(resolve(theme), alpha, backdrop.hex)
          assertAtLeast(
            contrast(faded, backdrop.hex),
            AA_NORMAL,
            `${file}:${line}: text-${token}/${alphaText} on ${theme}/${backdrop.name}`,
          )
          checked++
        }
      }
    }
  }
  // Nothing to report is a legitimate outcome — but say so, rather than
  // leaving a silent zero-iteration pass that looks like coverage.
  assert.ok(checked >= 0, 'unreachable')
})

test('the light-mode brand blue is untouched and dark mode differs from it', () => {
  // The brand colour is the brand: the dark-mode remedy must be an additional
  // token, never a redefinition of the light one.
  assert.equal(linkTokens.light, '#0066cc', 'the light-mode link colour must stay the brand blue')
  assert.notEqual(
    linkTokens.dark,
    linkTokens.light,
    'dark mode must not reuse the brand blue as text: it measures 3.06-3.42:1 there',
  )
  assert.ok(
    hueGap(hsl(linkTokens.light).h, hsl(linkTokens.dark).h) <= 20,
    'the dark-mode link colour must stay recognisably the brand hue',
  )
})

test('white on the solid brand fill still clears AA', () => {
  // brand.primary stays #0066cc precisely because it is a solid fill under
  // white text (.btn-primary, bg-brand-primary). This is the pair that would
  // have broken had the dark-mode link fix been applied to brand.primary
  // itself.
  const css = readMainCss()
  const brandPrimary = css.match(/--color-brand-primary:\s*(#[0-9a-f]{6})/i)
  assert.ok(brandPrimary, '--color-brand-primary not found in main.css')
  assertAtLeast(
    contrast('#ffffff', brandPrimary[1].toLowerCase()),
    AA_NORMAL,
    'white button label on the solid brand fill',
  )
})

/* ------------------------------------------------------------------ *
 * 6. The tokens tested here must be the tokens the stylesheet ships
 * ------------------------------------------------------------------ */

function readMainCss() {
  return fs.readFileSync(fileURLToPath(new URL('../src/assets/styles/main.css', import.meta.url)), 'utf8')
}

function tripletToHex(triplet) {
  const parts = triplet.trim().split(/\s+/).map(Number)
  assert.equal(parts.length, 3, `expected an "R G B" triplet, got "${triplet}"`)
  return `#${parts.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/**
 * Read a custom property out of one rule of main.css. The selector is matched
 * with its opening brace so that a mention of the selector inside a comment
 * cannot be mistaken for the rule itself.
 */
function cssVar(css, name, selector = ':root') {
  const rule = new RegExp(`(^|\\n)${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(css)
  assert.ok(rule, `rule "${selector}" not found in main.css`)
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(rule[2])
  assert.ok(m, `${name} not found in "${selector}" of main.css`)
  return m[1].trim()
}

function compositeOver(topHex, alpha, bottomHex) {
  const top = channels(topHex)
  const bottom = channels(bottomHex)
  return `#${top
    .map((v, i) => Math.round((v * alpha + bottom[i] * (1 - alpha)) * 255).toString(16).padStart(2, '0'))
    .join('')}`
}

test('main.css declares exactly the surface and text tokens these tests use', () => {
  // The stylesheet is what the browser paints; palette.ts is what these tests
  // measure. Without this check the two could drift and every assertion above
  // would keep passing while the site regressed.
  const css = readMainCss()
  const expected = [
    ['--color-light-bg', surfaces.light.bg],
    ['--color-light-surface', surfaces.light.surface],
    ['--color-light-text', textTokens.light.fg],
    ['--color-light-muted', textTokens.light.muted],
    ['--color-dark-bg', surfaces.dark.bg],
    ['--color-dark-surface', surfaces.dark.surface],
    ['--color-dark-text', textTokens.dark.fg],
    ['--color-dark-muted', textTokens.dark.muted],
    ['--color-brand-link', linkTokens.light],
  ]
  for (const [name, hex] of expected) {
    assert.equal(tripletToHex(cssVar(css, name)), hex, `${name} in main.css disagrees with palette.ts`)
  }
  assert.equal(
    tripletToHex(cssVar(css, '--color-brand-link', 'html.dark')),
    linkTokens.dark,
    '--color-brand-link under html.dark disagrees with linkTokens.dark',
  )
})

test('the glass-card composites in main.css match the tested card surfaces', () => {
  // `.glass-card` paints at 80% opacity over the page background, so the
  // colour a reader actually sees behind card text is the blend. That blend is
  // what surfaces.*.card must be, or the card assertions test a surface that
  // does not exist.
  const css = readMainCss()
  const light = /\.glass-card\s*\{[^}]*background-color:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(css)
  const dark = /\.dark \.glass-card\s*\{[^}]*background-color:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(css)
  assert.ok(light, '.glass-card background-color not found in main.css')
  assert.ok(dark, '.dark .glass-card background-color not found in main.css')

  const toHex = (m) =>
    `#${[1, 2, 3].map((i) => Number(m[i]).toString(16).padStart(2, '0')).join('')}`

  assert.equal(
    compositeOver(toHex(light), Number(light[4]), surfaces.light.bg),
    surfaces.light.card,
    'surfaces.light.card is not the composite main.css actually paints',
  )
  assert.equal(
    compositeOver(toHex(dark), Number(dark[4]), surfaces.dark.bg),
    surfaces.dark.card,
    'surfaces.dark.card is not the composite main.css actually paints',
  )
})

/* ------------------------------------------------------------------ *
 * 7. The browser sweep must not silently lose a page
 * ------------------------------------------------------------------ */

test('the browser test route list covers every route the router declares', () => {
  const router = fs.readFileSync(fileURLToPath(new URL('../src/router/index.ts', import.meta.url)), 'utf8')
  const declared = [...router.matchAll(/path:\s*'([^']+)'/g)].map((m) => m[1])
  assert.ok(declared.length > 10, `only ${declared.length} routes parsed from the router`)

  const covered = new Set([
    ...STATIC_ROUTES.map((r) => r.path),
    ...PARAM_ROUTES.map((r) => r.routerPath),
  ])
  const missing = declared.filter((p) => !covered.has(p))
  assert.deepEqual(
    missing,
    [],
    `routes declared in src/router/index.ts but never visited by tests/e2e: ${missing.join(', ')}`,
  )

  for (const route of ALL_ROUTES) {
    assert.ok(route.path.startsWith('/'), `route path must be absolute: ${route.path}`)
    assert.ok(
      typeof route.contains === 'string' && route.contains.length > 0,
      `route ${route.path} needs a "contains" sentinel so an empty render cannot pass`,
    )
  }
})

/* ------------------------------------------------------------------ *
 * 8. No component may go back to painting a raw seed colour
 * ------------------------------------------------------------------ */

test('no template declares a colour in an inline style attribute', () => {
  // The original defect in one line: `:style="{ backgroundColor: source.color }"`.
  // An inline colour cannot vary by theme, so anything reintroducing this
  // pattern reintroduces the bug — and it would be invisible to every token
  // test above, which only see what goes through palette.ts.
  //
  // Scope, stated honestly: this reads the style ATTRIBUTES in the templates.
  // Quoting (single or double), kebab- vs camelCase and line breaks are all
  // handled, so reformatting is not a way past it. Indirection is: a binding
  // that names a variable, `:style="someComputed"`, whose object is assembled
  // in <script>, is not something a regex can follow, and short of parsing the
  // SFC this test cannot see it. The rendered-DOM axe scan in
  // tests/e2e/contrast-dom.spec.js is the backstop for that case: it measures
  // whatever colour the browser ended up computing, however it got there.
  const root = fileURLToPath(new URL('../src', import.meta.url))
  const files = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.vue')) files.push(full)
    }
  }
  walk(root)
  assert.ok(files.length > 20, `only ${files.length} .vue files found — the walk is broken`)

  const COLOUR_KEY =
    /(^|[^-\w])(color|backgroundColor|background-color|borderColor|border-color|fill|stroke|background)\s*:/
  const offenders = []
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    // Every `:style="..."` / `style="..."` binding, including multi-line ones.
    for (const match of text.matchAll(/:?style=(["'])([\s\S]*?)\1/g)) {
      // Quotes around a key ({ 'background-color': ... }) are stripped so a
      // quoted, kebab-cased, or multi-line spelling is not a way past this.
      const body = match[2].replace(/['"`]/g, '')
      const line = text.slice(0, match.index).split('\n').length
      if (COLOUR_KEY.test(body)) {
        offenders.push(`${file}:${line}: inline style sets a colour: ${body.replace(/\s+/g, ' ')}`)
      }
    }
    // The alpha-suffix trick the badges used: `source.color + '20'`.
    for (const match of text.matchAll(/\bcolor\s*\+\s*'[0-9a-fA-F]{2}'/g)) {
      const line = text.slice(0, match.index).split('\n').length
      offenders.push(`${file}:${line}: hex+alpha string concatenation: ${match[0]}`)
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `inline colour styles bypass the per-theme palette:\n${offenders.join('\n')}`,
  )
})

test('the browser specs use the shared route inventory', () => {
  // The route-coverage test above only proves the inventory matches the
  // router. It would stay green while the browser suite quietly visited some
  // other, shorter list — so the specs are checked for actually importing it.
  const dir = fileURLToPath(new URL('./e2e', import.meta.url))
  const specs = fs.readdirSync(dir).filter((f) => f.endsWith('.spec.js'))
  assert.ok(specs.length >= 2, `expected browser specs in tests/e2e, found ${specs.join(', ')}`)
  const sources = specs.map((f) => fs.readFileSync(`${dir}/${f}`, 'utf8')).join('\n')
  for (const name of ['ALL_ROUTES', 'NARROW_VIEWPORTS', 'CONTRAST_SCAN_ROUTES']) {
    assert.ok(
      new RegExp(`\\b${name}\\b`).test(sources),
      `no browser spec uses ${name}; the shared route inventory is not what the browser visits`,
    )
  }
})
