import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'node tests/fixtures/catalog-server.mjs',
      url: 'http://127.0.0.1:4399/health',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run start -w @bee/storefront',
      url: 'http://127.0.0.1:4321/health/live',
      env: {
        HOST: '127.0.0.1',
        PORT: '4321',
        API_INTERNAL_URL: 'http://127.0.0.1:4399',
      },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run preview -w @bee/admin',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
