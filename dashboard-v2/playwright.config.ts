import { defineConfig, devices } from '@playwright/test';

const port = 4174;

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // The built app and the fixture API, through dashboard/server.py's Handler.
  webServer: {
    command: `python3 e2e/serve.py --port ${port}`,
    url: `http://localhost:${port}/v2/`,
    reuseExistingServer: !process.env.CI,
  },
});
