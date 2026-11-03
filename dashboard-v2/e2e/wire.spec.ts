// The app on the real store: the stream from serve.py's live fixtures, and the fallback poller.
import { expect, test } from '@playwright/test';

test('the page opens the stream and shows the live fixture', async ({ page }) => {
  await page.goto('/v2/#sessions/live');
  await expect(page.locator('#conn')).toHaveAttribute('data-mode', 'live');
  await expect(page.locator('#n-sessions')).toHaveText('2');
});

test('a stream that says bye off falls back to the polls of the same fixture', async ({ page }) => {
  await page.route('**/api/live*', (r) => r.fulfill({ contentType: 'text/event-stream', body: 'event: bye\ndata: {"reason":"off"}\n\n' }));
  await page.goto('/v2/#sessions/live');
  await expect(page.locator('#conn')).toHaveAttribute('data-mode', 'polling');
  await expect(page.locator('#n-sessions')).toHaveText('2');
});

test('the fixture cookie picks the live fixture for the stream and the reads', async ({ request }) => {
  const r = await request.get('/api/team-admin', { headers: { Cookie: 'fixture=private-team' } });
  expect((await r.json()).admin).toBe(false);
  // A resume goes on after since, with a hello first; this one ends at the fixture's bye.
  const live = await (await request.get('/api/live?fixture=basic&since=e5a17c0d-52')).text();
  expect(live).toMatch(/^event: hello\n[\s\S]*id: e5a17c0d-53\n[\s\S]*event: bye\n/);
  expect(live).not.toContain('event: snapshot');
});
