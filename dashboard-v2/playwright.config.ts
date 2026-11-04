import { defineConfig, devices } from '@playwright/test';

const port = 4174;
const dsPort = 4175;
const ds = /\/ds\.spec\.ts$/;

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  // One zone on every host, so a day group of the fixtures' clock reads the same on the laptop and in CI.
  use: { baseURL: `http://localhost:${port}`, timezoneId: 'America/New_York' },
  projects: [
    { name: 'chromium', testIgnore: ds, use: { ...devices['Desktop Chrome'] } },
    // The #__ds example page is in the dev build only, so its check runs on the Vite dev server.
    { name: 'ds', testMatch: ds, use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${dsPort}` } },
  ],
  webServer: [
    // The built app and the fixture API, through dashboard/server.py's Handler.
    {
      command: `python3 e2e/serve.py --port ${port}`,
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
