// Run a parity probe on the v2 build in Playwright's Chromium and print what it returns (parity-v2.sh).
//   node e2e/parity-probe.ts <page url> <probe js file>
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [url, file] = process.argv.slice(2);
if (!url || !file) throw new Error('usage: node e2e/parity-probe.ts <url> <probe.js>');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url);
  await page.locator('#favicon').waitFor({ state: 'attached' });
  // The probe is the body of an async function, as page.sh --probe takes it.
  console.log(await page.evaluate(`(async () => { ${readFileSync(file, 'utf8')} })()`));
} finally {
  await browser.close();
}
