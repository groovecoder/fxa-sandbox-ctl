import { defineConfig, devices } from '@playwright/test';

const port = 4174;
const dsPort = 4175;
// The #__ds example page and the teams-b harness are in the dev build only, so their checks run on the Vite dev server.
const ds = /\/(ds|teams-b)\.spec\.ts$/;
const zone = 'America/New_York';

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  // One zone on every host, for the page and for serve.py's fixture days, so a day reads the same on the laptop and in CI.
  use: { baseURL: `http://localhost:${port}`, timezoneId: zone },
  projects: [
    { name: 'chromium', testIgnore: ds, use: { ...devices['Desktop Chrome'] } },
    { name: 'ds', testMatch: ds, use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${dsPort}` } },
  ],
  webServer: [
    // The built app and the fixture API, through dashboard/server.py's Handler.
    {
      command: `python3 e2e/serve.py --port ${port}`,
      env: { TZ: zone },
      url: `http://localhost:${port}/v2/`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npx vite --port ${dsPort} --strictPort`,
      url: `http://localhost:${dsPort}/v2/`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
