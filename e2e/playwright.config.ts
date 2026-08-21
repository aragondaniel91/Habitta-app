import { defineConfig, devices } from '@playwright/test';

const localBaseUrl = 'http://127.0.0.1:4173';
const baseURL = process.env.E2E_BASE_URL || localBaseUrl;
const useLocalWebServer = !process.env.E2E_BASE_URL;

// The Worker only boots for the financial project, which is the run that owns Supabase
// credentials. Public browser runs never set them, so they keep starting just the web app.
const localWorkerUrl = 'http://127.0.0.1:8787';
const workerBaseUrl = process.env.E2E_API_BASE_URL || localWorkerUrl;
const startLocalWorker =
  !process.env.E2E_API_BASE_URL &&
  Boolean(process.env.E2E_SUPABASE_URL) &&
  Boolean(process.env.E2E_SUPABASE_ANON_KEY);

const localWebEnvironment: Record<string, string> = {
  VITE_APP_ENV: 'e2e',
  VITE_API_URL: workerBaseUrl,
  ...(startLocalWorker
    ? {
        VITE_SUPABASE_URL: process.env.E2E_SUPABASE_URL ?? '',
        VITE_SUPABASE_ANON_KEY: process.env.E2E_SUPABASE_ANON_KEY ?? '',
      }
    : {}),
};

const webServers = [
  ...(useLocalWebServer
    ? [
        {
          command: 'pnpm --filter @habitta/web exec vite --host 127.0.0.1 --port 4173',
          cwd: '..',
          env: localWebEnvironment,
          url: localBaseUrl,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ]
    : []),
  ...(startLocalWorker
    ? [
        {
          // Local Supabase keys are the CLI's published defaults, not secrets.
          command: [
            'pnpm --filter @habitta/api exec wrangler dev --local --port 8787',
            `--var SUPABASE_URL:${process.env.E2E_SUPABASE_URL}`,
            `--var SUPABASE_ANON_KEY:${process.env.E2E_SUPABASE_ANON_KEY}`,
            `--var CORS_ALLOWED_ORIGINS:${localBaseUrl}`,
          ].join(' '),
          cwd: '..',
          url: `${localWorkerUrl}/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ]
    : []),
];

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: process.env.CI
    ? [['github'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL,
    locale: 'es-VE',
    timezoneId: 'America/Caracas',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  ...(webServers.length ? { webServer: webServers } : {}),
  projects: [
    {
      name: 'public-chromium',
      testMatch: /public-.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'public-mobile',
      testMatch: /public-.*\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'financial-chromium',
      testMatch: /financial-.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
