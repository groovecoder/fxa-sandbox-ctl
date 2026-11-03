// The Stats view (design 6.8): each parity item on the live fixture and the v1 stats data that serve.py answers.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

type Stats = Record<string, unknown> & { rows: Record<string, unknown>[]; prs: Record<string, unknown>[] };
const DAY = 86400000;

// Answers /api/stats with the fixture copy after f changes it; the ETag stays, so the stream frames still apply.
async function withStats(page: Page, f: (s: Stats) => void) {
  await page.route('**/api/stats*', async (r) => {
    const res = await r.fetch(), s = (await res.json()) as Stats;
    f(s);
    await r.fulfill({ response: res, json: s });
  });
}
const tile = (page: Page, l: string) => page.locator(`#s-stats .kpis > [data-lbl="${l}"]`);
const big = async (page: Page, l: string) => tile(page, l).getAttribute('data-big');
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('statsFilter') ?? 'null'));
async function open(page: Page, hash: string) {
  await page.goto(`/v2/${hash}`);
  await expect(page.locator('#s-stats')).toBeVisible();
}
const card = (page: Page, title: string) => page.locator('#s-stats .st-card').filter({ has: page.locator('h3').first().filter({ hasText: new RegExp(`^${title}`) }) });

test('entry: the rail opens Spend with its range, and a saved team filter (the Teams link) shows as a chip', async ({ page }) => {
  await page.goto('/v2/#overview');
  await page.locator('a[data-nav="stats"]').click();
  await expect(page).toHaveURL(/#stats\/spend$/);
  await expect(page.locator('#s-stats h2')).toContainText(/^Spend\w{3} \d+ to \w{3} \d+$/);
  await page.evaluate(() => localStorage.setItem('statsFilter', JSON.stringify({ range: '30d', team: 'example' })));
  await page.reload();
  await expect(page.locator('#s-stats .chip')).toHaveText(['Example ×']);
  await expect(page.locator('#side select[data-f="team"]')).toHaveValue('example');
});

test('entry: an Overview link sets the filters for the visit; no change saves them; Restore and Keep these', async ({ page }) => {
  await page.goto('/v2/#overview');
  await page.evaluate(() => localStorage.setItem('statsFilter', JSON.stringify({ range: '90d', model: 'claude-haiku-5-5' })));
  await page.reload();
  await open(page, '#stats/spend?range=7d&src=slack');
  const banner = page.locator('.st-ov');
  await expect(banner).toContainText('Filters set from Overview are not saved.');
  await expect(page.locator('#side [data-range="7d"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#s-stats .chip')).toHaveText(['Slack sessions ×']);
  await page.locator('#side [data-range="30d"]').click();
  await page.locator('a[href="#stats/prs"]').click();
  await expect(page.locator('#side [data-range="30d"]')).toHaveAttribute('aria-pressed', 'true');
  expect((await saved(page)).range).toBe('90d');
  await page.locator('[data-sfrestore]').click();
  await expect(banner).toBeHidden();
  await expect(page.locator('#side [data-range="90d"]')).toHaveAttribute('aria-pressed', 'true');
  await open(page, '#stats/spend?range=7d');
  await page.locator('[data-sfkeep]').click();
  await expect(banner).toBeHidden();
  await expect(page).toHaveURL(/#stats\/spend$/);
  expect(await saved(page)).toMatchObject({ range: '7d', model: 'all' });
});

test('entry: a link with a bad range or source does nothing', async ({ page }) => {
  await open(page, '#stats/spend?range=evil&src=x');
  await expect(page.locator('#s-stats h2')).toContainText('Spend');
  await expect(page.locator('.st-ov')).toHaveCount(0);
  await expect(page.locator('#side [data-range="30d"]')).toHaveAttribute('aria-pressed', 'true');
});

test('states: loading, a failed read with no figures, and a copy that says error', async ({ page }) => {
  await page.route('**/api/stats*', () => { /* never answers */ });
  await page.goto('/v2/#stats/spend');
  await expect(page.locator('#s-stats')).toContainText('loading the run log…');
  await expect(page.locator('#side')).toContainText('loading…');
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.route('**/api/stats*', (r) => r.fulfill({ status: 502, contentType: 'text/plain', body: 'bad gateway' }));
  await page.reload();
  await expect(page.locator('#s-stats h2')).toHaveText('Stats');
  await expect(page.locator('#s-stats .emptybox')).toHaveText('The stats feed could not be read (HTTP 502). The next poll tries again.');
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.route('**/api/stats*', (r) => r.fulfill({ json: { error: 'snapshot --stats timed out' } }));
  await page.reload();
  await expect(page.locator('#s-stats .emptybox')).toHaveText('The stats feed could not be read (snapshot --stats timed out). The next poll tries again.');
});

test('heading: the tab title with its range, all time for All time; chips name only the filters the tab reads', async ({ page }) => {
  await open(page, '#stats/spend');
  await page.locator('#side select[data-f="src"]').selectOption('slack');
  await expect(page.locator('#s-stats .chip')).toHaveText(['Slack sessions ×']);
  await page.locator('a[href="#stats/runners"]').click();
  await expect(page.locator('#s-stats h2')).toContainText('Runners and LLM');
  await expect(page.locator('#s-stats .chip')).toHaveCount(0);
  await page.locator('a[href="#stats/spend"]').click();
  await page.locator('#s-stats .chip').click();
  await expect(page.locator('#s-stats .chip')).toHaveCount(0);
  await expect(page.locator('#side select[data-f="src"]')).toHaveValue('all');
  await page.locator('#side [data-range="all"]').click();
  await expect(page.locator('#s-stats h2 .sub')).toHaveText('all time');
});

test('filters: the 9 ranges, Custom with a From before To check, source per tab, kind reset, team, model labels', async ({ page }) => {
  await withStats(page, (s) => { s.rows[0]!.kind = 'fix'; s.rows[1]!.kind = 'feedback'; s.rows[1]!.models = { 'claude-opus-5-5': 1, 'claude-mini-9-1': 0.5 }; });
  await open(page, '#stats/spend');
  const side = page.locator('#side');
  await expect(side.locator('[data-range]')).toHaveText(['Today', 'Yesterday', '7 days', '30 days', '90 days', 'This month', 'Last month', 'All time', 'Custom']);
  await side.locator('[data-range="custom"]').click();
  await side.locator('[data-f="from"]').fill('2026-10-20');
  await side.locator('[data-f="to"]').fill('2026-10-10');
  await expect(side.getByRole('alert')).toHaveText('From is after To: pick a From day on or before the To day.');
  await side.locator('[data-range="30d"]').click();
  await expect(side.locator('[data-f="from"]')).toHaveCount(0);
  await expect(side.locator('[data-f="kind"] option')).toHaveText(['All kinds', 'Review feedback', 'Fix']);
  await side.locator('[data-f="kind"]').selectOption('fix');
  await side.locator('[data-f="src"]').focus();
  await side.locator('[data-f="src"]').selectOption('pipeline');
  await expect(side.locator('[data-f="kind"]')).toHaveValue('all');
  // Focus stays on the control that changed.
  await expect(side.locator('[data-f="src"]')).toBeFocused();
  await expect(side.locator('[data-f="team"] option')).toHaveText(['All teams', 'Example', 'sample-two']);
  await expect(side.locator('[data-f="model"] option')).toContainText(['All models', 'Haiku 5.5', 'Mini 9.1', 'Opus 5.5', 'Opus 5.5 (1M)', 'Sonnet 5.5']);
  await page.locator('a[href="#stats/prs"]').click();
  await expect(side.locator('[data-f="src"] option')).toHaveText(['All sources', 'Pipeline runs', 'Slack sessions']);
  await expect(side.locator('[data-f="kind"]')).toHaveCount(0);
  await page.locator('a[href="#stats/pipeline"]').click();
  await expect(side.locator('select')).toHaveCount(0);
});

test('filters: search as you type, Clear filters, the saved filter and its check on load', async ({ page }) => {
  await page.goto('/v2/#overview');
  await page.evaluate(() => localStorage.setItem('statsFilter', JSON.stringify({ range: 'evil', src: '<b>', team: 'example' })));
  await page.reload();
  await open(page, '#stats/spend');
  await expect(page.locator('#side [data-range="30d"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#side [data-f="src"]')).toHaveValue('all');
  await expect(page.locator('#side [data-f="team"]')).toHaveValue('example');
  const runs = Number(await big(page, 'Runs'));
  const q = page.locator('#side [data-f="q"]');
  await q.pressSequentially('EX-1');
  await expect.poll(() => big(page, 'Runs')).not.toBe(String(runs));
  await expect(q).toBeFocused();
  expect((await saved(page)).q).toBe('EX-1');
  await q.fill('zzz-none');
  await expect(page.locator('#s-stats .emptybox')).toHaveText('Nothing matches these filters.');
  await page.locator('#side [data-reset]').click();
  await expect(page.locator('#side [data-reset]')).toHaveCount(0);
  await expect(q).toHaveValue('');
  expect(await saved(page)).toMatchObject({ range: '30d', src: 'all', team: 'all', q: '' });
});

test('spend: five tiles, the day charts, by source and team, most expensive with the overhead first, by person, by model, by kind', async ({ page }) => {
  await open(page, '#stats/spend');
  await expect(page.locator('#s-stats .kpis > *')).toHaveCount(5);
  expect(await page.locator('#s-stats .kpis > *').evaluateAll((e) => e.map((x) => (x as HTMLElement).dataset.lbl))).toEqual(['Runs', 'Tickets and conversations', 'Spend', 'Per run', 'Median length']);
  await expect(tile(page, 'Spend')).toContainText('LLM, estimated from tokens');
  await expect(page.locator('#st-runs figcaption')).toHaveText('Runs per day');
  await expect(page.locator('#st-spend figcaption')).toHaveText('Spend per day');
  await expect(card(page, 'By source').locator('.st-kv .k').first()).toHaveText('Pipeline runs');
  await expect(card(page, 'By source')).toContainText('By team');
  await expect(card(page, 'Most expensive').locator('.st-kv .k').first()).toHaveText('Pipeline overhead');
  await expect(card(page, 'Most expensive')).toContainText('By person');
  await expect(card(page, 'Spend by model').locator('.mono').first()).toHaveText('Opus 5.5');
  await expect(card(page, 'Spend by model')).toContainText('Not recorded');
});

test('spend: an old stats feed makes each figure of one source unknown, never a value', async ({ page }) => {
  await page.route('**/api/live*', (r) => r.fulfill({ contentType: 'text/event-stream', body: 'event: bye\ndata: {"reason":"off"}\n\n' }));
  await page.route('**/api/snapshot*', async (r) => { const res = await r.fetch(), j = await res.json(); await r.fulfill({ json: { ...j, stats_age_seconds: 9000, stats_interval: 60 } }); });
  await open(page, '#stats/spend');
  await page.locator('#side [data-f="src"]').selectOption('slack');
  await expect(page.locator('#s-stats p.unknown')).toHaveText('Figures by source unknown: The stats feed is 150 min old.');
  await expect.poll(() => big(page, 'Runs')).toBe('unknown');
  await expect(card(page, 'By source')).toContainText('unknown');
});

test('spend: a long range shows weeks from Monday and says when it cuts the oldest weeks', async ({ page }) => {
  await withStats(page, (s) => { s.rows.push({ ...s.rows[0], at: new Date(Date.now() - 600 * DAY).toISOString() }); });
  await open(page, '#stats/spend');
  await page.locator('#side [data-range="all"]').click();
  await expect(page.locator('#st-runs figcaption')).toHaveText('Runs per week');
  await expect(page.locator('#st-runs')).toContainText(/Showing the last 60 of \d+ weeks\./);
});

test('spend: a click on a day narrows the range to that day; a chart has one tab stop and a table', async ({ page }) => {
  await open(page, '#stats/spend');
  const chart = page.locator('#st-runs [role="img"]');
  await chart.focus();
  await page.keyboard.press('End');
  await expect(page.locator('#st-runs')).toContainText(/Runs \d+/);
  await page.keyboard.press('Enter');
  await expect(page.locator('#side [data-range="custom"]')).toHaveAttribute('aria-pressed', 'true');
  const today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  await expect(page.locator('#side [data-f="from"]')).toHaveValue(today);
  await expect(page.locator('#side [data-f="to"]')).toHaveValue(today);
  await page.locator('#st-spend summary').click();
  await expect(page.locator('#st-spend table')).toBeVisible();
  await page.locator('#st-spend button', { hasText: 'Model' }).click();
  await expect(page.locator('#st-spend [role="img"]').first()).toHaveAttribute('aria-label', /by model/);
});

test('PRs: five tiles, the merged chart, by source and merged by, the lists with their row fields', async ({ page }) => {
  await withStats(page, (s) => {
    const now = Date.now(), iso = (d: number) => new Date(now - d * DAY).toISOString();
    s.prs.push({ n: 90, key: 'EX-90', title: 'old open', state: 'OPEN', created: iso(80), src: 'pipeline', add: 1, del: 1 },
      { n: 91, key: 'EX-91', title: 'closed', state: 'CLOSED', created: iso(5), closed: iso(2), src: 'slack' },
      { n: 92, key: 'EX-92', title: 'done', state: 'MERGED', created: iso(3), merged: iso(1), add: 4, del: 1, src: 'pipeline', by: 'user', jira: { status: 'In review', assignee: 'Example user' } });
  });
  await open(page, '#stats/prs');
  expect(await page.locator('#s-stats .kpis > *').evaluateAll((e) => e.map((x) => (x as HTMLElement).dataset.lbl))).toEqual(['Opened', 'Merged', 'Closed, not merged', 'Time to merge', 'Cost per merged PR']);
  expect(await big(page, 'Merged')).toBe('7');
  await expect(tile(page, 'Cost per merged PR')).toContainText(/last 4 full weeks .+ → .+ → .+ → /);
  await expect(page.locator('#st-merged figcaption')).toHaveText('Merged per day');
  await expect(card(page, 'By source')).toContainText('Merged by');
  await expect(card(page, 'Still open')).toContainText('#90');
  await expect(card(page, 'Recently merged').locator('.st-kv').first()).toContainText('Example user, In review');
  await expect(card(page, 'Recently merged')).toContainText('ticket not updated yet');
  await expect(card(page, 'Costliest merged')).toContainText('Closed, not merged');
  await page.locator('#side [data-f="q"]').fill('zzz-none');
  await expect(page.locator('#s-stats .emptybox')).toHaveText('No PR opened or merged in this range matches these filters.');
});

test('PRs: no PR list yet', async ({ page }) => {
  await withStats(page, (s) => { s.prs = []; });
  await open(page, '#stats/prs');
  await expect(page.locator('#s-stats .emptybox')).toHaveText('No PR list yet.');
});

test('runners and LLM: the four cards, day tables newest first, the all-time cache line', async ({ page }) => {
  await open(page, '#stats/runners');
  await expect(page.locator('#s-stats .st-card > h3')).toHaveText([/^Sessions at once/, /^Quick answers/, /^Runner time/, /^LLM spend/]);
  const today = await page.evaluate(() => new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  await expect(page.locator('#s-stats .tscroll table')).toHaveCount(2);
  await expect(page.locator('#s-stats .tscroll table').first().locator('tbody td').first()).toHaveText(today);
  await expect(card(page, 'Sessions at once').locator('.warnt')).toHaveText('4 of 4');
  await expect(card(page, 'LLM spend')).toContainText('Cache rewrites after a 5 min gap, all time');
  await expect(card(page, 'Runner time')).toContainText('No stopped session in this view has runner times yet.');
});

test('runners: a stopped session with runner times fills the runner card and its stop reasons', async ({ page }) => {
  await withStats(page, (s) => { Object.assign(s.rows[2]!, { runner_s: 7200, busy_s: 3600, backend: 'gce', boot_s: 40, stop: 'idle', compute_usd: 0.5 }); });
  await open(page, '#stats/runners');
  const c = card(page, 'Runner time');
  await expect(c).toContainText('Runner hours2.0 h');
  await expect(c).toContainText('Median boot, gce40 s');
  await expect(c).toContainText('Idle: runner stopped, session paused');
});

test('pipeline: all-time labels on waits and retries, the day table, the memory card hidden with no memory', async ({ page }) => {
  await open(page, '#stats/pipeline');
  const c = card(page, 'Pipeline queue');
  await expect(c).toContainText('Queued to first run, all time');
  await expect(c).toContainText('Tickets retried, all time1 of 6');
  await expect(page.locator('#s-stats .tscroll table')).toHaveCount(1);
  await expect(card(page, 'Team memory')).toContainText('2 live at once');
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await withStats(page, (s) => { s.memory = null; delete (s.pipeline as Record<string, unknown>).retried; });
  await page.reload();
  await expect(card(page, 'Pipeline queue')).toContainText('Tickets retried, all time—');
  await expect(page.locator('#s-stats')).not.toContainText('Team memory');
});

test('stream: the page reads the stats copy once and applies the stats frames to it', async ({ page, baseURL }) => {
  await page.context().addCookies([{ name: 'fixture', value: 'stats-parts', url: baseURL! }]);
  const base = ((await (await page.request.get('/api/stats?inproc=1&fixture=stats-parts')).json()) as Stats).rows;
  const reads: string[] = [];
  page.on('request', (r) => { if (new URL(r.url()).pathname === '/api/stats') reads.push(r.url()); });
  await open(page, '#stats/spend');
  await page.locator('#side [data-range="all"]').click();
  // Two rows came in a frame: Runs is the copy's rows plus two.
  await expect.poll(() => big(page, 'Runs')).toBe(String(base.length + 2));
  expect(reads.map((u) => new URL(u).search)).toEqual(['?inproc=1']);
});

test('phone width: no sideways scroll on Runners and LLM', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page, '#stats/runners');
  await expect(page.locator('#s-stats .tscroll').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const theme of ['light', 'dark'] as const) {
  test(`axe: no serious or critical issue on each Stats tab in the ${theme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    for (const t of ['spend', 'prs', 'runners', 'pipeline']) {
      await open(page, `#stats/${t}`);
      await expect(page.locator('#side .st-filters')).toBeVisible();
      for (const s of await page.locator('#s-stats summary').all()) await s.click();
      const { violations } = await new AxeBuilder({ page }).include('#s-stats').include('#side').analyze();
      const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${t}: ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    }
  });
}

test('reduced motion: no running animation on Stats', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, '#stats/spend');
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
});
