import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 30_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    // Uses the locally installed Edge/Chrome so no browser download is needed.
    channel: process.env.PW_CHANNEL ?? 'msedge',
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
