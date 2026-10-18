import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4321', channel: 'chromium' },
  webServer: {
    command: 'npm run test-page',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
  },
});
