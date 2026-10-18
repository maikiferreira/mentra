import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173',
    ...devices['Desktop Chrome'],
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/usr/bin/google-chrome',
      args: ['--no-sandbox'],
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
