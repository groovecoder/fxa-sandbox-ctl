// The Pipeline view (design 6.2 to 6.4): the live stream, then the v1 pipeline page fixture as a store for the flows.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { base, open } from './shell.fixture';

test.use({ viewport: { width: 1440, height: 900 } });

type J = ReturnType<typeof JSON.parse>;
const page1 = JSON.parse(readFileSync(new URL('../../skills/fxa-ctl-dev/page-fixture-pipeline.json', import.meta.url), 'utf8'));
// page.sh: "@iso-3600" is an ISO time an hour before now.
const rel = (v: J, now: number): J => Array.isArray(v) ? v.map((x) => rel(x, now))
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rel(x, now)]))
    : typeof v === 'string' && /^@iso[+-]\d+$/.test(v) ? new Date((now + Number(v.slice(4))) * 1000).toISOString() : v;
const feed = (data: unknown, ageSeconds = 30, interval = 60) => ({ data, ageSeconds, interval, error: null, refreshing: false, fetchedAt: 1 });

// The page fixture as the store: the shell keeps its fixed selectors, and the view reads this store through src/model.
async function pipe(page: Page, hash: string, edit?: (snap: J, agents: J, viewer: J) => void) {
  const fx = rel(page1, Date.now() / 1000), snap = fx['/api/snapshot'], viewer = { ...fx['/api/team-admin'] };
  edit?.(snap.snapshot, snap.agents, viewer);
  const ss: J[] = snap.agents.sessions ?? [];
  await open(page, hash, {
    store: {
      ...base().store, viewer,
      feeds: { full: feed(snap.snapshot), agents: feed(snap.agents, 5, 30), stats: feed(fx['/api/stats'] ?? { rows: [] }) },
      sessions: { byKey: Object.fromEntries(ss.map((x) => [x.key, x])), order: ss.map((x) => x.key) },
      flow: { points: Array.from({ length: 30 }, (_, i) => ({ at: 1_793_750_000 + i * 60, stops: [3, 1, 2, 0, 1, 1, i % 3, 2, 4 + (i >> 3)], merged: 4, closed: 1 })) },
    },
  });
}
const setFeeds = (page: Page, f: string) =>
  page.evaluate((src) => {
    const st = (window as unknown as { __V2_STORE__: { getState: () => J; setState: (x: J) => void } }).__V2_STORE__;
    const feeds = structuredClone(st.getState().feeds);
    new Function('feeds', src)(feeds);
    st.setState({ feeds });
  }, f);
const row = (page: Page, key: string) => page.locator(`[data-belt="${key}"]`);
const tile = (page: Page, l: string) => page.locator(`[data-stat="${l}"] .text-kpi`);

test('the belts come from the live stream, and the page asks the stream for the live belts\' tails', async ({ page }) => {
  const tails = page.waitForRequest((r) => r.url().endsWith('/api/live/tails') && r.postDataJSON()?.keys?.length > 0);
  await page.goto('/v2/#pipeline/belts');
  await expect(row(page, 'EX-101')).toContainText('Fix the sample login button');
  await expect(row(page, 'EX-101').locator('.trk [role=img]')).toHaveAttribute('aria-label', /agent working\. Stop 3 of 9, Agent$/);
  expect((await tails).postDataJSON().keys).toEqual(['EX-101', 'EX-102']);
});

test('header tiles, the stop header, the phases and sub-groups, and the outside list', async ({ page }) => {
  await pipe(page, '#pipeline/belts');
  await expect(tile(page, 'Needs you')).toHaveText('1');
  await expect(tile(page, 'Agents working')).toHaveText('2');
  await expect(tile(page, 'Open PRs')).toHaveText('3');
  await expect(page.locator('[data-stat="Open PRs"] a')).toHaveAttribute('href', 'https://github.com/example/app/pulls?q=is%3Apr+state%3Aopen+label%3Abot-pr');
  await expect(tile(page, 'Merged, 7 days')).toHaveText('1');
  await expect(page.locator('.bstops .cols span')).toHaveText(['1', '1', '1', '·', '·', '·', '3', '2', '·']);
  await expect(page.getByRole('group', { name: 'Review and merge' }).locator('.belt')).toHaveCount(3);
  await expect(page.getByRole('group', { name: 'Decide' })).toContainText('FXA-1');
  await expect(page.locator('details.bout > summary')).toHaveText('Outside the pipeline (2) · 2 wait 3+ days');
});

test('a row: separate Jira and PR links, the scope tag, CI bars, the stop text, and an age with its unit', async ({ page }) => {
  await pipe(page, '#pipeline/belts');
  const r = row(page, 'FXA-3');
  await expect(r.locator('a[data-focus=jira]')).toHaveAttribute('href', 'https://jira.example.com/browse/FXA-3');
  await expect(r.locator('a[data-focus=pr]')).toHaveAttribute('href', 'https://github.com/example/app/pull/3');
  await expect(r.locator('a[data-focus=pr]')).toHaveAttribute('rel', 'noopener');
  await expect(r.locator('.m')).toContainText('auth');
  await expect(r.getByRole('img', { name: '21 passed, 1 failed, 0 running' })).toBeVisible();
  await expect(r.locator('.age')).toHaveText(/^\d+ days$/);
  await expect(row(page, 'FXA-20').locator('.age')).toHaveText('12 min');
});

test('a plain click opens the row in place with replace; Esc closes it and the focus goes back to the row', async ({ page }) => {
  await pipe(page, '#pipeline/belts');
  const n = await page.evaluate(() => history.length);
  await row(page, 'FXA-20').locator('a[data-focus=row]').click();
  await expect(page).toHaveURL(/#pipeline\/belts\/FXA-20$/);
  expect(await page.evaluate(() => history.length)).toBe(n);
  const region = page.getByRole('region', { name: 'Details of FXA-20' });
  await expect(region).toContainText('Agent: Agent · 12 min');
  await expect(region.locator('.acts > *')).toHaveText(['Watch the agent', 'Jira ↗']);
  await region.getByRole('link', { name: 'Jira ↗' }).focus();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#pipeline\/belts$/);
  await expect(row(page, 'FXA-20').locator('a[data-focus=row]')).toBeFocused();
  await expect(row(page, 'FXA-20').locator('a[data-focus=row]')).not.toHaveAttribute('aria-controls');
});

test('the main action follows the v1 order, and a modified click keeps the browser default', async ({ page }) => {
  await pipe(page, '#pipeline/belts/FXA-3');
  await expect(page.getByRole('region', { name: 'Details of FXA-3' }).locator('a.main')).toHaveText('Open the failing check');
  await page.goto('/v2/#pipeline/belts/FXA-10');
  await expect(page.getByRole('region', { name: 'Details of FXA-10' }).locator('a.main')).toHaveAttribute('href', 'https://github.com/example/app/pull/10');
  await page.goto('/v2/#pipeline/belts/FXA-1');
  await expect(page.getByRole('region', { name: 'Details of FXA-1' }).locator('a.main')).toHaveText('Answer in Jira');
  const popup = page.context().waitForEvent('page');
  await row(page, 'FXA-3').locator('a[data-focus=row]').click({ modifiers: ['ControlOrMeta'] });
  await popup;
  await expect(page).toHaveURL(/#pipeline\/belts\/FXA-1$/);
});

test('Watch the agent opens the terminal and focuses it; the terminal shows the tail lines', async ({ page }) => {
  await pipe(page, '#pipeline/belts/FXA-20');
  await page.getByRole('button', { name: 'Watch the agent' }).click();
  await expect(page.locator('#lane-term-FXA-20 > summary')).toBeFocused();
  await expect(page.locator('#lane-term-FXA-20 > summary')).toContainText('connecting…');
  await page.evaluate(() => (window as unknown as { __V2_STORE__: { setState: (x: unknown) => void } }).__V2_STORE__
    .setState({ tails: { 'FXA-20': { lines: ['[tool] Bash yarn test', 'PASS sample'], state: 'running', at: 1 } } }));
  await expect(page.getByRole('log')).toContainText('PASS sample');
  await expect(page.locator('#lane-term-FXA-20 > summary')).toContainText('running');
});

test('a belt that moves stop keeps its focus, and under reduced motion nothing animates', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await pipe(page, '#pipeline/belts');
  await row(page, 'FXA-21').locator('a[data-focus=row]').focus();
  await setFeeds(page, "feeds.agents.data.runners[1].stage = 'watching';");
  await expect(row(page, 'FXA-21').locator('.trk [role=img]')).toHaveAttribute('aria-label', /Stop 3 of 9, Agent$/);
  await expect(row(page, 'FXA-21').locator('a[data-focus=row]')).toBeFocused();
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
});

test('the where line names the place of a key with no belt, and a bad link names no ticket', async ({ page }) => {
  await pipe(page, '#pipeline/belts/FXA-7');
  await expect(page.locator('#bwhere')).toHaveText('FXA-7 waits on FXA-2 (Queue and review)');
  await page.goto('/v2/#pipeline/belts/FXA-30');
  await expect(page.locator('#bwhere')).toHaveText('FXA-30 is ready in the queue (Queue and review)');
  await page.goto('/v2/#pipeline/belts/FXA-50');
  await expect(page.locator('#bwhere')).toHaveText('FXA-50 merged 1 day ago (Done)');
  await page.goto('/v2/#pipeline/belts/FXA-99');
  await expect(page.locator('#bwhere')).toHaveText('FXA-99 is not on a belt now. Look in Queue and review or Done.');
  await page.goto('/v2/#pipeline/belts/a%20b');
  await expect(page.locator('#bwhere')).toHaveText('That link names no ticket.');
  await expect(page).toHaveURL(/#pipeline\/belts$/);
});

for (const admin of [true, false]) {
  test(`routine names on the outside belts show only to an admin: ${admin ? 'admin' : 'not an admin'}`, async ({ page }) => {
    await pipe(page, '#pipeline/belts', (_, agents, viewer) => {
      Object.assign(agents.sessions[0], { routine_run: 3, routine_name: 'Nightly check' });
      viewer.admin = admin;
    });
    await page.locator('details.bout > summary').click();
    await expect(row(page, 'agent-abc123')).toContainText(admin ? 'Routine · Routine: Nightly check' : 'Routine · scheduled run');
    if (!admin) await expect(row(page, 'agent-abc123')).not.toContainText('Nightly');
  });
}

test('a feed that failed makes its group and counts unknown, never 0', async ({ page }) => {
  await pipe(page, '#pipeline/belts', (snap) => { snap.blocked = null; });
  await expect(tile(page, 'Needs you')).toHaveText('?');
  await expect(page.locator('#s-lanes').getByText('Needs you: unknown, Jira fetch failed', { exact: true })).toBeVisible();
  await expect(page.locator('.bgh .cnt').first()).toHaveText('?');
});

test('at 720 px the stop header hides and each row says "at <stop>"', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await pipe(page, '#pipeline/belts');
  await expect(page.locator('.bstops')).toBeHidden();
  await expect(row(page, 'FXA-20').locator('.stn')).toHaveText('at Agent');
  await expect(row(page, 'FXA-20').locator('.stn')).toBeVisible();
});

test('the flow: a Sankey node filters the belts; the cumulative flow has its summary and table; a funnel below 640 px', async ({ page }) => {
  await pipe(page, '#pipeline/belts');
  const sankey = page.getByRole('img', { name: /^Pipeline now:/ });
  await expect(sankey).toHaveAttribute('aria-label', /^Pipeline now: 3 in the queue \(1 ready, 1 held, 1 skipped\), 2 in an agent run, 5 at a PR, 1 merged in 7 days, 0 closed\.$/);
  await sankey.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Showing the belts at Boot to Push.')).toBeVisible();
  await expect(page.locator('.belt')).toHaveCount(2);
  await page.getByRole('button', { name: 'Show all stops' }).click();
  await expect(page.getByRole('img', { name: /^Tickets at each stop over time/ })).toHaveAttribute('aria-label', /Since the server started, 30 minutes\. Now: Queue 3,/);
  await expect(page.getByRole('figure', { name: 'Cumulative flow' }).locator('tbody tr')).toHaveCount(3);
  await page.setViewportSize({ width: 600, height: 900 });
  await expect(page.getByRole('list', { name: 'Tickets at each phase now' })).toBeVisible();
});

test('Queue and review: tiles, the review lists, the queue head, and held tickets apart from the count', async ({ page }) => {
  await pipe(page, '#pipeline/queue');
  await expect(tile(page, 'Waiting on a reviewer')).toHaveText('2');
  await expect(tile(page, 'Stuck in review')).toHaveText('2');
  await expect(tile(page, 'Launchable')).toHaveText('1');
  await expect(tile(page, 'Waits on a person')).toHaveText('1');
  await expect(page.locator('h2.qh').nth(0)).toHaveText('Waiting on a reviewer2oldest wait first');
  await expect(page.locator('#s-review .item .line1 .key').first()).toHaveText('FXA-10');
  await expect(page.locator('#s-queue h2.qh .n')).toHaveText(await page.getByRole('link', { name: /^Queue and review/ }).locator('.n').innerText());
  await expect(page.locator('#s-queue .item').first()).toContainText('next up');
  await expect(page.locator('details[data-k=held]')).toHaveAttribute('open', '');
  await expect(page.getByRole('img', { name: /^5 PRs in review\. 5 wait 3 days or more\./ })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Queue: 1 ready, 1 held, 1 skipped: needs a decision. Next up FXA-30.' })).toBeVisible();
});

test('Queue: a person\'s open or close of each details survives an update; intake-off rows keep the source badge', async ({ page }) => {
  await pipe(page, '#pipeline/queue');
  await page.locator('details[data-k=skipped] > summary').click();
  await page.locator('details[data-k=held] > summary').click();
  await setFeeds(page, 'feeds.full.ageSeconds = 3;');
  await expect(page.locator('details[data-k=skipped]')).toHaveAttribute('open', '');
  await expect(page.locator('details[data-k=held]')).not.toHaveAttribute('open');
  await setFeeds(page, "feeds.full.data.mode = { newtickets: 'off' };");
  await page.locator('details[data-k=launchable] > summary').click();
  await expect(page.locator('details[data-k=launchable] .item .psrc-jira')).toHaveCount(1);
});

test('Done: tiles, the line, the merges per week, and a table that sorts by each column', async ({ page }) => {
  await pipe(page, '#pipeline/done', (snap) => {
    snap.merged_prs.push({ number: 51, key: 'FXA-51', title: 'fix: a second sample', created: new Date(Date.now() - 3 * 86400000).toISOString(), merged: new Date().toISOString(), merged_by: 'another-reviewer' });
  });
  await expect(tile(page, 'Tickets merged')).toHaveText('2');
  await expect(tile(page, 'Median days to merge')).toHaveText('5');
  await expect(page.locator('#dline')).toHaveText('2 tickets from the last 30 merged PRs labelled bot-pr, newest first.');
  const keys = page.locator('.dtab tbody td:first-child .key:first-child');
  await expect(keys).toHaveText(['FXA-51', 'FXA-50']);
  await expect(page.locator('.dtab tbody td:nth-child(3)').first()).toHaveText('today');
  await page.getByRole('button', { name: 'Days to merge' }).click();
  await expect(keys).toHaveText(['FXA-51', 'FXA-50']);
  await page.getByRole('button', { name: 'Days to merge' }).click();
  await expect(keys).toHaveText(['FXA-50', 'FXA-51']);
  await expect(page.getByRole('list', { name: 'Merged by' })).toContainText('another-reviewer');
});

for (const theme of ['light', 'dark'] as const) {
  test(`axe: no serious or critical issue on the three tabs, ${theme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    for (const tab of ['belts/FXA-20', 'queue', 'done']) {
      await pipe(page, `#pipeline/${tab}`);
      await page.locator('#s-lanes, #s-review, #s-done').first().waitFor();
      const r = await new AxeBuilder({ page }).include('#main').analyze();
      expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${tab}: ${v.id} ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
    }
  });
}
