import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// loadEnv with mode 'test' reads .env, .env.local, .env.test, .env.test.local
const env = loadEnv('test', process.cwd(), '');

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.spec.ts'],
    testTimeout: 30000,
    env,
  },
});
