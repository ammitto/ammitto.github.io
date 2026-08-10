/**
 * The site's colour system: theme surfaces, text/link tokens, and the
 * derivation that turns a brand "seed" colour (a source's flag colour, an
 * entity-type colour, a status colour, a colour that arrived with ontology
 * data) into colours that are legible in BOTH themes.
 *
 * Why this module exists
 * ---------------------
 * Badges, filter pills and source tiles used to paint themselves from the raw
 * seed hex through inline styles (`color: source.color`,
 * `backgroundColor: source.color + '20'`). Inline styles cannot vary by theme,
 * so a single palette had to serve a white page and a near-black one. It did
 * not: "European Union" (#003399) measured 1.55:1 on the dark result cards and
 * "Australia" (#00008b) 1.24:1 on the dark hero — invisible text. Light mode
 * was under AA too (amber "Person" 1.92:1, green "Organization" 2.22:1).
 *
 * Every colour here is therefore derived per theme, and `tests/contrast.test.js`
 * recomputes WCAG contrast over every pair this module can produce and fails
 * below AA. That test implements the WCAG formula itself; nothing in this file
 * consults a contrast ratio, so the assertions are a real check rather than a
 * restatement of how the values were built (see "Non-circular by design").
 *
 * Non-circular by design
 * ----------------------
 * The derivation never looks at contrast. It moves the seed to a FIXED
 * lightness in OKLab (a perceptual colour space) for the given role and theme,
 * caps chroma, keeps the hue, and clamps the result into sRGB. WCAG relative
 * luminance is not OKLab lightness — it is weighted heavily towards green —
 * so a fixed OKLab L still yields a range of contrast ratios across hues. A
 * seed whose hue cannot reach the target, or an edited target, makes the test
 * fail. Had the derivation instead searched for "the closest colour with
 * ratio >= 4.5", the test would have passed for every possible input and
 * proven nothing.
 *
 * Consumers should use the `*Vars` helpers, which emit BOTH themes' values as
 * CSS custom properties in one inline style. The paired rules in
 * `src/assets/styles/main.css` (`.tone-pill` / `.dark .tone-pill`, ...) pick
 * the right set. Nothing reads the active theme in JavaScript: the theme is a
 * class on <html> applied before hydration, and a JS read would risk a
 * server/client mismatch in the prerendered (vite-ssg) HTML.
 */

export type Theme = 'light' | 'dark'

export interface Tone {
  /** Text colour. */
  fg: string
  /** Opaque fill. Opaque, not a translucent tint, so the tested pair is the
   *  rendered pair no matter what the pill is sitting on. */
  bg: string
  /** Decorative edge. Not a WCAG 1.4.11 boundary: the pill is identified by
   *  its fill and label, so this is not held to 3:1. */
  border: string
}

export interface ThemedTone {
  light: Tone
  dark: Tone
}

export interface TileTone {
  /** Initials colour. */
  fg: string
  /** Solid tile colour. */
  bg: string
}

export interface ThemedTileTone {
  light: TileTone
  dark: TileTone
}

/* ------------------------------------------------------------------ *
 * sRGB <-> OKLab
 * Coefficients from Björn Ottosson's OKLab definition.
 * ------------------------------------------------------------------ */

interface Rgb {
  r: number
  g: number
  b: number
}

/** OKLCh: lightness 0..1, chroma 0..~0.4, hue in degrees. */
interface Lch {
  l: number
  c: number
  h: number
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

export function parseHex(hex: string): Rgb {
  const s = hex.trim().replace(/^#/, '')
  const full = s.length === 3 ? s[0] + s[0] + s[1] + s[1] + s[2] + s[2] : s
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    // Unparseable input (bad data, a hand-edit typo) must not silently paint
    // an unreadable colour; fall back to the neutral seed.
    return parseHex(NEUTRAL_SEED)
  }
  return {
    r: parseInt(full.slice(0, 2), 16) / 255,
    g: parseInt(full.slice(2, 4), 16) / 255,
    b: parseInt(full.slice(4, 6), 16) / 255,
  }
}

export function toHex({ r, g, b }: Rgb): string {
  const part = (v: number) =>
    Math.round(clamp01(v) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

function toLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

function fromLinear(v: number): number {
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
}

function rgbToOklab(c: Rgb): { l: number; a: number; b: number } {
  const r = toLinear(c.r)
  const g = toLinear(c.g)
  const b = toLinear(c.b)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

function oklabToRgb(lab: { l: number; a: number; b: number }): Rgb {
  const l_ = lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b
  const m_ = lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b
  const s_ = lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b
  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_
  return {
    r: fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  }
}

function rgbToLch(c: Rgb): Lch {
  const lab = rgbToOklab(c)
  const chroma = Math.sqrt(lab.a * lab.a + lab.b * lab.b)
  let hue = (Math.atan2(lab.b, lab.a) * 180) / Math.PI
  if (hue < 0) hue += 360
  return { l: lab.l, c: chroma, h: hue }
}

function lchToRgbRaw(lch: Lch): Rgb {
  const rad = (lch.h * Math.PI) / 180
  return oklabToRgb({
    l: lch.l,
    a: Math.cos(rad) * lch.c,
    b: Math.sin(rad) * lch.c,
  })
}

function inGamut(c: Rgb): boolean {
  const eps = 1e-4
  return (
    c.r >= -eps && c.r <= 1 + eps && c.g >= -eps && c.g <= 1 + eps && c.b >= -eps && c.b <= 1 + eps
  )
}

/**
 * Render an OKLCh colour as sRGB, reducing chroma (and only chroma) until it
 * fits the gamut. Lightness and hue are preserved, so the role's contrast
 * budget and the seed's identity both survive. The bisection here searches for
 * gamut fit, never for a contrast ratio.
 */
function lchToRgb(lch: Lch): Rgb {
  const direct = lchToRgbRaw(lch)
  if (inGamut(direct)) return direct
  let lo = 0
  let hi = lch.c
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (inGamut(lchToRgbRaw({ ...lch, c: mid }))) lo = mid
    else hi = mid
  }
  return lchToRgbRaw({ ...lch, c: lo })
}

/* ------------------------------------------------------------------ *
 * Theme surfaces and text
 * ------------------------------------------------------------------ */

/**
 * Every backdrop text can land on, per theme. `card` is the `.glass-card`
 * composite — the card paints itself at 80% opacity over the page background,
 * so the colour a reader actually sees is the blend, and that is what the
 * contrast test must use. Keep this in step with the `:root` variables and
 * `.glass-card` rules in `src/assets/styles/main.css`; `tests/contrast.test.js`
 * parses that file and fails if the two drift apart.
 */
export const surfaces: Record<Theme, { bg: string; surface: string; card: string }> = {
  light: {
    bg: '#f5f5f7',
    surface: '#ffffff',
    // rgba(255,255,255,0.8) over #f5f5f7
    card: '#fdfdfd',
  },
  dark: {
    bg: '#0f0f1a',
    surface: '#1a1a2e',
    // rgba(26,26,46,0.8) over #0f0f1a
    card: '#18182a',
  },
}

/** Body text and the de-emphasised text tone, per theme. */
export const textTokens: Record<Theme, { fg: string; muted: string }> = {
  light: {
    fg: '#1a1a2e',
    // Was #6b7280, which measured 4.44:1 on the #f5f5f7 page background —
    // 118 elements sitting just under AA across every page.
    muted: '#5b6270',
  },
  dark: {
    fg: '#f5f5f7',
    muted: '#9ca3af',
  },
}

/**
 * Link/accent text. The light value is the brand blue and must not change —
 * it is the brand. On dark backgrounds #0066cc measured 3.06–3.42:1, so dark
 * mode gets a lighter tint of the same hue.
 *
 * This is deliberately separate from `brand.primary`, which stays #0066cc in
 * both themes because it is also a solid fill under white text (`.btn-primary`,
 * `bg-brand-primary`); lightening that fill would break the white-on-blue pair
 * instead.
 */
export const linkTokens: Record<Theme, string> = {
  light: '#0066cc',
  dark: '#6cb0f5',
}

/* ------------------------------------------------------------------ *
 * Role targets
 * ------------------------------------------------------------------ */

/** The seed used when a colour is unknown, missing, or unparseable. */
export const NEUTRAL_SEED = '#6b7280'

/** Below this OKLCh chroma a seed carries no usable hue (#000000, #ffffff,
 *  grays); such seeds are rendered as neutrals rather than being given an
 *  arbitrary hue by the atan2 of numerical noise. The threshold sits above
 *  the 0.023 chroma of the neutral #6b7280 — amplifying that to a full badge
 *  tint turned "delisted" and country pills visibly blue — and far below the
 *  0.075 of the least saturated real brand seed (World Bank #002244). */
export const ACHROMATIC_CHROMA = 0.03

interface RoleTarget {
  l: number
  maxChroma: number
}

/**
 * Fixed OKLab lightness / chroma-cap per role and theme. These are the only
 * dials in the system. They were chosen so that every seed in
 * `src/config/index.ts` clears AA with margin in both themes — which
 * `tests/contrast.test.js` verifies independently, and which is exactly what
 * fails if someone retunes them carelessly.
 */
const ROLE_TARGETS: Record<Theme, { fg: RoleTarget; bg: RoleTarget; border: RoleTarget; tile: RoleTarget }> = {
  light: {
    fg: { l: 0.45, maxChroma: 0.14 },
    bg: { l: 0.955, maxChroma: 0.035 },
    border: { l: 0.86, maxChroma: 0.07 },
    // Dark tile under white initials.
    tile: { l: 0.45, maxChroma: 0.14 },
  },
  dark: {
    fg: { l: 0.85, maxChroma: 0.11 },
    bg: { l: 0.28, maxChroma: 0.05 },
    border: { l: 0.42, maxChroma: 0.07 },
    // Light tile under dark initials — the mirror of light mode, so the tile
    // reads as a highlight on a near-black page instead of a dark hole.
    tile: { l: 0.84, maxChroma: 0.11 },
  },
}

/** Initials printed on a `tileTone` fill, per theme. */
export const TILE_INK: Record<Theme, string> = {
  light: '#ffffff',
  dark: '#0f0f1a',
}

function roleColor(seed: string, target: RoleTarget): string {
  const lch = rgbToLch(parseHex(seed))
  const achromatic = lch.c < ACHROMATIC_CHROMA
  return toHex(
    lchToRgb({
      l: target.l,
      c: achromatic ? 0 : Math.min(lch.c, target.maxChroma),
      h: achromatic ? 0 : lch.h,
    }),
  )
}

/* ------------------------------------------------------------------ *
 * Public derivations
 * ------------------------------------------------------------------ */

/** Both themes' colours for a pill (badge, active filter pill, method chip). */
export function pillTone(seed: string): ThemedTone {
  const forTheme = (theme: Theme): Tone => ({
    fg: roleColor(seed, ROLE_TARGETS[theme].fg),
    bg: roleColor(seed, ROLE_TARGETS[theme].bg),
    border: roleColor(seed, ROLE_TARGETS[theme].border),
  })
  return { light: forTheme('light'), dark: forTheme('dark') }
}

/** Both themes' colours for a solid tile carrying initials. */
export function tileTone(seed: string): ThemedTileTone {
  const forTheme = (theme: Theme): TileTone => ({
    fg: TILE_INK[theme],
    bg: roleColor(seed, ROLE_TARGETS[theme].tile),
  })
  return { light: forTheme('light'), dark: forTheme('dark') }
}

/**
 * Both themes' colours for coloured text/icons drawn straight on a surface
 * (the ontology hierarchy icons), where there is no pill fill to sit on.
 */
export function inkTone(seed: string): Record<Theme, string> {
  return {
    light: roleColor(seed, ROLE_TARGETS.light.fg),
    dark: roleColor(seed, ROLE_TARGETS.dark.fg),
  }
}

/* ------------------------------------------------------------------ *
 * Template helpers: one inline style carrying both themes
 * ------------------------------------------------------------------ */

export type ToneVars = Record<string, string>

export function pillToneVars(seed: string | undefined | null): ToneVars {
  const tone = pillTone(seed || NEUTRAL_SEED)
  return {
    '--tone-fg': tone.light.fg,
    '--tone-bg': tone.light.bg,
    '--tone-border': tone.light.border,
    '--tone-fg-dark': tone.dark.fg,
    '--tone-bg-dark': tone.dark.bg,
    '--tone-border-dark': tone.dark.border,
  }
}

export function tileToneVars(seed: string | undefined | null): ToneVars {
  const tone = tileTone(seed || NEUTRAL_SEED)
  return {
    '--tile-fg': tone.light.fg,
    '--tile-bg': tone.light.bg,
    '--tile-fg-dark': tone.dark.fg,
    '--tile-bg-dark': tone.dark.bg,
  }
}

export function inkToneVars(seed: string | undefined | null): ToneVars {
  const tone = inkTone(seed || NEUTRAL_SEED)
  return {
    '--ink-fg': tone.light,
    '--ink-fg-dark': tone.dark,
  }
}

/** Seed for the "GET"/"POST" chips in the API docs. */
export const METHOD_SEED = '#16a34a'
