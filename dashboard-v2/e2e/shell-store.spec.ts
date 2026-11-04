// The shell on the real store: the rail and the Refresh button, with the live fixtures through serve.py.
import { expect, test, type Page } from '@playwright/test';

// The fixtures' clock, so an age or a day group reads the same on every run.
const NOW = 1793750400 + 30;

test.use({ viewport: { width: 1440, height: 900 } });
test.beforeEach(({ page }) => page.clock.setFixedTime(NOW * 1000));

const badge = (page: Page, v: string) => page.locator(`#n-${v}`);
const open = async (page: Page, hash: string) => {
  await page.goto(`/v2/${hash}`);
  await expect(page.locator('#conn')).toHaveAttribute('data-mode', 'live');
};


test('rail: 7 links with icon, label and badge; aria-current; an empty badge is hidden', async ({ page }) => {
  await open(page, '#errors');
  const links = page.getByRole('navigation', { name: 'Views' }).getByRole('link');
  await expect(links).toHaveText(['Overview!', 'Pipeline1', 'Sessions2', 'Stats', 'Errors', 'Sandboxes3', 'Teams2']);
  for (const a of await links.all()) await expect(a.locator('svg')).toHaveCount(1);
  await expect(page.getByRole('link', { name: /^Errors/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('a[aria-current]')).toHaveCount(2);
  await expect(badge(page, 'stats')).toBeHidden();
  // The fixture's delta resolved the one open error.
  await expect(badge(page, 'errors')).toBeHidden();
});













test('status bar: Refresh POSTs /api/refresh', async ({ page }) => {
  const posts: string[] = [];
  await page.route('**/api/refresh', (r) => { posts.push(r.request().method()); return r.fulfill({ json: {} }); });
  await open(page, '#overview');
  await page.locator('#refresh').click();
  await expect.poll(() => posts).toEqual(['POST']);
});








