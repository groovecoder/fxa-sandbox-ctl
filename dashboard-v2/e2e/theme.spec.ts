import { expect, test, type Page } from '@playwright/test';

const theme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme);
const bg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('the theme script follows the system theme when no choice is saved', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/v2/');
  expect(await theme(page)).toBe('dark');
  expect(await bg(page)).toBe('rgb(27, 31, 36)');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => theme(page)).toBe('light');
  expect(await bg(page)).toBe('rgb(246, 248, 250)');
});

test('a saved theme wins over the system theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/v2/');
  await page.evaluate(() => localStorage.setItem('theme', 'light'));
  await page.reload();
  expect(await theme(page)).toBe('light');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.evaluate(() => localStorage.setItem('theme', 'dark'));
  await page.reload();
  expect(await theme(page)).toBe('dark');
});
