import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'web/tests',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:5173', browserName: 'chromium' },
  webServer: [
    { command: 'python3 -m api.index', url: 'http://127.0.0.1:8000/api?route=materials', reuseExistingServer: true, timeout: 30_000 },
    { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: true, timeout: 30_000 }
  ]
});
