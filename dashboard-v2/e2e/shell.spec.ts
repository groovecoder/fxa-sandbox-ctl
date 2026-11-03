import { expect, test } from '@playwright/test';

test('the build renders at /v2 and /v2/ under the v2 CSP, with no console error', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  for (const path of ['/v2/#stats/spend', '/v2#teams']) {
    const r = await page.goto(path);
    expect(r?.headers()['content-security-policy']).toContain("script-src 'self'");
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(path.endsWith('spend') ? 'Stats' : 'Teams');
  }
  await page.goto('/v2/#nope');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Overview');
  expect(errors).toEqual([]);
});

test('the fixture feeds answer through the server Handler', async ({ request }) => {
  const r = await request.get('/api/snapshot');
  expect(r.ok()).toBe(true);
  expect((await r.json()).snapshot?.repo).toBe('example/repo');
});
