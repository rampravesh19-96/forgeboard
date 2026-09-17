import { defineConfig } from '@playwright/test';

// Requires the actual API/web servers, migrated PostgreSQL, and the demo seed.
// Deliberately separate from tests/ (the fixture-based browser suite).
export default defineConfig({
  testDir: './real-tests',
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  outputDir: 'test-results/real',
  use: {
    baseURL: 'http://localhost:3000',
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: process.env.CI
    ? [
        {
          command: 'node --env-file-if-exists=../../.env dist/main.js',
          cwd: '../api',
          url: 'http://127.0.0.1:4000/api/health',
          env: { NODE_ENV: 'development' },
          reuseExistingServer: false,
          timeout: 60_000,
        },
        {
          command:
            'node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000',
          url: 'http://localhost:3000/sign-in',
          reuseExistingServer: false,
          timeout: 60_000,
        },
      ]
    : undefined,
});
