import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration. E2E tests are intentionally separate from
 * `npm test` (unit/integration) so the mandatory verification gate stays fast.
 * The web server is reused when already running; otherwise Playwright starts it.
 */

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000/api/status',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
