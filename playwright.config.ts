import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/seed.spec.ts'],
  timeout: 120_000,
  retries: 1,
  use: {
    baseURL:
      process.env['PLAYWRIGHT_BASE_URL'] ??
      (() => {
        throw new Error('PLAYWRIGHT_BASE_URL must be set — see .env.e2e.local');
      })(),
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
