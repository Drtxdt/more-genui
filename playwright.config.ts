import './tests/browser/environment.mjs';
import { defineConfig } from '@playwright/test';
const baseURL = 'http://127.0.0.1:' + (process.env.GENUI_TEST_PORT || '4183');
export default defineConfig({
  testDir: 'tests/browser',
  testMatch: '*.spec.mjs',
  timeout: 30000,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL,
    headless: true,
    launchOptions: { timeout: 15000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node tests/browser/server.mjs',
    url: baseURL,
    reuseExistingServer: false,
  },
  projects: [
    { name: 'Chromium', use: { browserName: 'chromium' } },
    { name: 'Edge', use: { channel: 'msedge' } },
  ],
});
