import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const theme of ['light', 'dark'] as const) {
  test(`#__ds has no serious or critical axe issue in the ${theme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/v2/#__ds');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Design system');
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
    // Open each table, so axe checks the tables too.
    for (const s of await page.getByText('Show as table').all()) await s.click();
    const { violations } = await new AxeBuilder({ page }).analyze();
    const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}

test('#__ds: a chart takes one tab stop and reads the focused point', async ({ page }) => {
  await page.goto('/v2/#__ds');
  const gantt = page.getByRole('img', { name: 'Two sessions. The second ran past its cap.' });
  await gantt.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByText(/^EX-1: boot /).first()).toBeVisible();
});

test('#__ds: under reduced motion no element has a running animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/v2/#__ds');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Design system');
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
});
