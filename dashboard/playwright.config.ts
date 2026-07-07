import { defineConfig, devices } from '@playwright/test';

// E2E tests run against the Fastify server (api/) which serves the built SPA.
// Pre-requisite: `cd dashboard && pnpm build` then `cd api && pnpm build` before running tests.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:3001',
    headless: true,
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'cd ../api && pnpm start',
    url: 'http://localhost:3001',
    timeout: 60000,
    reuseExistingServer: !process.env.CI,
  },
});
