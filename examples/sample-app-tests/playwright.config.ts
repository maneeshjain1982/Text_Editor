import { defineConfig } from '@playwright/test'

const PORT = 4173

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  projects: [
    {
      // Node-only checks on the installed package (no browser).
      name: 'package',
      testMatch: 'package.spec.ts',
    },
    {
      // Browser tests against the sample app's production build.
      name: 'app',
      testMatch: 'app.spec.ts',
      use: {
        baseURL: `http://localhost:${PORT}`,
        // Locally installed Edge by default; PW_CHANNEL=chrome for Chrome.
        channel: process.env.PW_CHANNEL ?? 'msedge',
        viewport: { width: 1400, height: 950 },
        acceptDownloads: true,
      },
    },
  ],
  webServer: [
    {
      // Gemini backend in mock mode: same server code and protocol, deterministic output, no API key.
      command: 'npm --prefix ../ai-server run mock',
      url: 'http://localhost:8787/api/ai/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // Build (includes vue-tsc) then serve the production bundle, as a real deployment would.
      command: 'npm --prefix ../sample-app run build && npm --prefix ../sample-app run preview',
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
})
