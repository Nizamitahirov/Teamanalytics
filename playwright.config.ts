import { defineConfig, devices } from '@playwright/test';

// v2 e2e (SPEC §13.1). Mock server (8765) + Vite dev (5173) avtomatik işə salınır.
// v1 ssenariləri hələ dev/e2e.py-dədir (npm run e2e:v1).
export default defineConfig({
  testDir: 'dev/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'npm run dev', url: 'http://localhost:8765/api/health', reuseExistingServer: !process.env.CI, timeout: 60_000 },
    {
      command: 'npm run dev:v2 -- --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
