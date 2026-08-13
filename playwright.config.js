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
        // --host 127.0.0.1 is load-bearing, not tidiness. `vite preview`
        // defaults to host `localhost`, and Node resolves that name through
        // the system resolver: IPv4 first on this workstation, IPv6 first on
        // a GitHub runner. There the server binds to ::1 only, while the url
        // below is polled on 127.0.0.1, so nothing ever answers and the run
        // dies at the timeout without executing a single test — passing
        // locally and failing in CI on both the small and the full dataset.
        // Binding explicitly removes the resolver from the question.
        command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
        url: 'http://127.0.0.1:4173/',
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
        // Without this the server's own stderr is swallowed, so a startup
        // failure surfaces only as "timed out waiting" with no cause. The
        // first diagnosis of the bug above cost far more than this noise.
        stdout: 'pipe',
        stderr: 'pipe',
      },
})
