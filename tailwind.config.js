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
        brand: {
          primary: '#0066cc',
          secondary: '#1a1a2e',
        },
        status: {
          active: '#ef4444',
          suspended: '#f97316',
          delisted: '#6b7280',
        },
      },
    },
  },
  plugins: [],
}
