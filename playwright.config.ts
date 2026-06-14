import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/seed.spec.ts'],
  timeout: 120_000,
  retries: 1,
  use: {
    baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'https://drive-mate.marcinjaro95.workers.dev',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
