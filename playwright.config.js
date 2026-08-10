import { defineConfig, devices } from '@playwright/test'

/**
 * Browser tests for the two things a unit test cannot decide: whether a page
 * lays out without horizontal overflow at a phone width, and what contrast the
 * browser actually computes from the shipped CSS.
 *
 * Deliberately small: one browser (chromium), pinned exactly in package.json,
 * run against the PRODUCTION build (`dist/`) rather than the dev server, so
 * what is measured is what deploys.
 *
 * `npm run test:e2e` expects `npm run build` to have run already. That split
 * keeps the browser tests re-runnable against one build instead of paying for
 * a rebuild per run, and it is how the CI workflow sequences them.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // One retry on CI only. These assertions are deterministic — a layout width,
  // a computed colour — so a retry never turns a real failure green; it stops a
  // single flaky page load from blocking a deployment. Locally, zero, so a
  // flake is visible while it is being written.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npx vite preview --port 4173 --strictPort',
        url: 'http://127.0.0.1:4173/',
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
      },
})
