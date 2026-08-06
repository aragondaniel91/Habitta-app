import { defineConfig, devices } from '@playwright/test';

const localBaseUrl = 'http://127.0.0.1:4173';
const baseURL = process.env.E2E_BASE_URL || localBaseUrl;
const useLocalWebServer = !process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [
        ['github'],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
      ]
    : [
        ['list'],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
      ],
  use: {
    baseURL,
    locale: 'es-VE',
    timezoneId: 'America/Caracas',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: useLocalWebServer
    ? {
        command: 'pnpm --filter @habitta/web dev -- --host 127.0.0.1 --port 4173',
        cwd: '..',
        env: {
          VITE_APP_ENV: 'e2e',
          VITE_API_URL: 'http://127.0.0.1:8787',
        },
        url: localBaseUrl,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
  projects: [
    {
      name: 'public-chromium',
      testMatch: /public-.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'public-mobile',
      testMatch: /public-.*\.spec\.ts/,
      use: { ...devices['iPhone 15'] },
    },
    {
      name: 'financial-chromium',
      testMatch: /financial-.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
