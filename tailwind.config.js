/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      // Setting `sans` replaces Tailwind's default stack, so every existing
      // utility picks the new text face up without editing 41 components.
      // `display` and `mono` are additive.
      fontFamily: {
        display: ['"Bodoni Moda"', 'Georgia', '"Times New Roman"', 'serif'],
        sans: ['"IBM Plex Sans"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      // ADDITIVE display sizes. The existing text-sm/lg/2xl scale is left
      // alone on purpose: text-sm alone has 141 call sites, and redefining it
      // would silently reflow every page in the app.
      fontSize: {
        'display-xl': ['clamp(2.75rem, 7.5vw, 5.75rem)', { lineHeight: '0.93', letterSpacing: '-0.022em' }],
        'display-lg': ['clamp(2rem, 4.2vw, 3.5rem)', { lineHeight: '1.02', letterSpacing: '-0.016em' }],
        'display-md': ['clamp(1.5rem, 2.7vw, 2.25rem)', { lineHeight: '1.1', letterSpacing: '-0.01em' }],
        label: ['0.6875rem', { lineHeight: '1.1', letterSpacing: '0.16em' }],
      },
      /*
       * Panels in this design are ruled, not rounded. Zeroing the box radii
       * here converts every `rounded`, `rounded-md`, `rounded-lg` and
       * `rounded-xl` already written across the views — 60-odd call sites in
       * 41 files — instead of editing each one and missing some. `full` is
       * untouched, so anything genuinely circular (avatars, the theme toggle,
       * status dots) still is.
       */
      borderRadius: {
        none: '0',
        sm: '0',
        DEFAULT: '0',
        md: '0',
        lg: '0',
        xl: '0',
        '2xl': '0',
        '3xl': '0',
      },
      colors: {
        // brand.primary/secondary and status.* stay literal hex values
        // (not var()-mapped) because the codebase uses them with opacity
        // modifiers (bg-brand-primary/10, bg-status-delisted/20, ...),
        // which Tailwind cannot derive from an opaque var() reference.
        brand: {
          // Kept in step with --color-brand-primary in main.css by hand: these
          // stay literal (not var()-mapped) because the codebase uses them with
          // opacity modifiers, which Tailwind cannot derive from a var().
          primary: '#a3155f',
          secondary: '#11161a',
          accent: 'var(--color-brand-accent)',
          // Link/accent TEXT. Unlike brand.primary this one is theme-aware:
          // the variable is redefined under html.dark in main.css, because
          // #3853a5 as text on the dark surfaces falls well below AA.
          // brand.primary stays literal so solid fills under white text
          // (btn-primary, bg-brand-primary) keep the brand colour.
          link: 'rgb(var(--color-brand-link) / <alpha-value>)',
        },
        status: {
          active: '#ef4444',
          suspended: '#f97316',
          delisted: '#6b7280',
        },
        // Theme palette: single-sourced from the CSS variables declared in
        // src/assets/styles/main.css. The variables hold bare RGB triplets
        // (e.g. 255 255 255) so the rgb(... / <alpha-value>) form lets
        // Tailwind derive opacity modifiers (bg-light-surface/50, ...).
        light: {
          bg: 'rgb(var(--color-light-bg) / <alpha-value>)',
          surface: 'rgb(var(--color-light-surface) / <alpha-value>)',
          text: 'rgb(var(--color-light-text) / <alpha-value>)',
          muted: 'rgb(var(--color-light-muted) / <alpha-value>)',
          border: 'rgb(var(--color-light-border) / <alpha-value>)',
          // text-light-fg is used throughout the views; alias of light.text.
          fg: 'rgb(var(--color-light-text) / <alpha-value>)',
        },
        dark: {
          bg: 'rgb(var(--color-dark-bg) / <alpha-value>)',
          surface: 'rgb(var(--color-dark-surface) / <alpha-value>)',
          text: 'rgb(var(--color-dark-text) / <alpha-value>)',
          muted: 'rgb(var(--color-dark-muted) / <alpha-value>)',
          border: 'rgb(var(--color-dark-border) / <alpha-value>)',
          // text-dark-fg / bg-dark-card are used throughout the views;
          // aliases of dark.text and dark.surface.
          fg: 'rgb(var(--color-dark-text) / <alpha-value>)',
          card: 'rgb(var(--color-dark-surface) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
}
