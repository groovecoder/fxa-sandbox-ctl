import { expect, test } from '@playwright/test';

test('the build has no #__ds page: the hash shows the default view', async ({ page }) => {
  await page.goto('/v2/#__ds');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Overview');
});
