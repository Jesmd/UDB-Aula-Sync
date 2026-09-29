import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm exec tsx tests/mock-moodle/server.ts',
    cwd: '../..',
    url: 'https://127.0.0.1:8443/__health',
    ignoreHTTPSErrors: true,
    reuseExistingServer: !process.env.CI,
  },
});
