/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // brand.primary/secondary and status.* stay literal hex values
        // (not var()-mapped) because the codebase uses them with opacity
        // modifiers (bg-brand-primary/10, bg-status-delisted/20, ...),
        // which Tailwind cannot derive from an opaque var() reference.
        brand: {
          primary: '#0066cc',
          secondary: '#1a1a2e',
          accent: 'var(--color-brand-accent)',
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
