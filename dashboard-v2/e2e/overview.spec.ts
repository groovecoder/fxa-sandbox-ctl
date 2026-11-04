// The Overview on the basic live fixture; the recent runs come from the v1 Overview page fixture.
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// The page.sh rule: "@iso-600" is an ISO time 10 min ago.
const rel = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(rel);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rel(x)]));
  const m = typeof v === 'string' && /^@iso([+-]\d+)$/.exec(v);
  return m ? new Date(Date.now() + Number(m[1]) * 1000).toISOString().replace(/\.\d+Z$/, 'Z') : v;
};
const RUNS = JSON.parse(readFileSync(new URL('../../skills/fxa-ctl-dev/page-fixture-overview.json', import.meta.url), 'utf8'))['/api/runs/recent'];

async function open(page: Page, hash = '#overview') {
  const asked: string[] = [];
  await page.route('**/api/runs/recent*', (r) => { asked.push(r.request().url()); return r.fulfill({ json: rel(RUNS) }); });
  await page.goto(`/v2/${hash}`);
  await expect(page.locator('#ov-main [data-ovmetric]').first()).toBeVisible();
  await expect(page.locator('#ov-runs .ovrun').first()).toBeVisible();
  return asked;
}

test('the metrics come first after the head, then Activity and Teams, then the month, LLM spend and the hours', async ({ page }) => {
  await open(page);
  const ids = await page.locator('.ov section[id]').evaluateAll((s) => s.map((x) => x.id));
  expect(ids).toEqual(['ov-head', 'ov-main', 'ov-runs', 'ov-teams', 'ov-budget', 'ov-llm', 'ov-hours']);
  await expect(page.locator('#ov-head')).toContainText(/\d+ at work now/);
  await expect(page.locator('#ov-head')).toContainText(/\d agents? and \d sessions?/);
  await expect(page.locator('#ov-head .ovkpi')).toHaveText(/^LLM, last hour \$\d+\.\d\d$/);
});

test('the range is in the hash, keeps the focus, and reads the runs again for that range', async ({ page }) => {
  const asked = await open(page);
  expect(asked.at(-1)).toContain('days=30');
  await expect(page.locator('[data-ovrange="30d"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-ovrange="7d"]').click();
  await expect(page).toHaveURL(/#overview\?range=7d$/);
  await expect(page.locator('[data-ovrange="7d"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-ovrange="7d"]')).toBeFocused();
  await expect(page.locator('#ov-teams h2')).toContainText('Teams, last 7 days');
  await expect.poll(() => asked.at(-1)).toContain('days=7');
  await page.goto('/v2/#overview?range=90d&metric=runs');
  await expect(page.locator('[data-ovrange="90d"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-ovmetric="runs"]')).toHaveAttribute('aria-pressed', 'true');
});

test('the metric tabs: values, the change words, the chart and its table, and the keys on the chart', async ({ page }) => {
  await open(page);
  await expect(page.locator('[data-ovmetric] .mv')).toHaveCount(5);
  await expect(page.locator('[data-ovmetric="spend"] .mv')).toHaveText(/^\$\d/);
  await expect(page.locator('#ov-main .ovkinds a').first()).toHaveAttribute('href', /^#stats\/spend\?range=30d&src=/);
  await expect(page.locator('#ov-main .ovkinds a').first()).toContainText(/\d+% of spend/);
  // Each metric has its trend line under the value.
  await expect(page.locator('[data-ovmetric="spend"] .msp polyline')).toHaveCount(1);
  await expect(page.locator('[data-ovmetric="spend"]')).toHaveAccessibleName(/^Spend ?: \$[\d,.]+$/);
  await expect(page.locator('[data-ovmetric="spend"]')).not.toHaveAccessibleName(/by day/);
  await expect(page.locator('#ov-main p.vh')).toContainText('Spend in the last 30 days:');
  const chart = page.locator('#ov-main [role="img"][tabindex]');
  await expect(chart).toHaveAttribute('aria-label', /^Spend by day and source, last 30 days\. Total \$/);
  await chart.focus();
  await page.keyboard.press('End');
  await expect(page.locator('#ov-main [aria-live="polite"]')).toContainText('Pipeline runs $');
  await page.locator('[data-ovmetric="median"]').click();
  await expect(page).toHaveURL(/metric=median/);
  await expect(page.locator('#ov-main [role="img"][tabindex]')).toHaveAttribute('aria-label', /^Median pipeline run, by day/);
  await page.locator('#ov-main summary', { hasText: 'Show as table' }).click();
  await expect(page.locator('#ov-main table th').nth(2)).toHaveText('25th to 75th percentile');
  await page.locator('[data-ovmetric="merged"]').click();
  await expect(page.locator('#ov-main .ovopen')).toHaveCount(1);
  await expect(page.locator('#ov-main .ovopen')).toContainText('Cost per merged PR');
});

test('a click on a day of the spend chart opens Stats', async ({ page }) => {
  await open(page);
  await expect(page.locator('#ov-main .recharts-brush')).toHaveCount(0);
  await page.locator('#ov-main [role="img"][tabindex]').first().scrollIntoViewIfNeeded();
  const box = (await page.locator('#ov-main [role="img"][tabindex] .recharts-surface').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page).toHaveURL(/#stats\/spend\?range=(30d|today|yesterday)$/);
});

test('Activity: the summary, the row fields, a PR link, and a session link to its real tab', async ({ page }) => {
  await open(page);
  const a = page.locator('#ov-runs');
  await expect(a.getByRole('link', { name: 'All sessions', exact: true })).toHaveAttribute('href', '#sessions');
  const pr = a.locator('.ovrun[data-run="EX-310"]');
  await expect(pr.getByRole('link', { name: 'PR #312' })).toHaveAttribute('href', 'https://github.com/example/repo/pull/312');
  await expect(pr).toContainText('16 min · $1.12');
  await expect(pr).toContainText('example');
  // agent-ex0001 is live in the basic fixture: its link goes to the Live tab, not to Stopped.
  await expect(a.locator('.ovrun[data-run="agent-ex0001"] a.key')).toHaveAttribute('href', '#sessions/live/agent-ex0001');
  await expect(a.locator('.ovrun[data-run="EX-298"]')).toContainText('PR #301 merged');
});

test('Activity shows a run whose title is its key once', async ({ page }) => {
  const runs = { ...RUNS, runs: [{ ...RUNS.runs[0], key: 'EX-399', title: 'EX-399' }] };
  await page.route('**/api/runs/recent*', (r) => r.fulfill({ json: rel(runs) }));
  await page.goto('/v2/#overview');
  await expect(page.locator('#ov-runs .ovrun .t').first()).toHaveText(/^EX-399\s*$/);
});

test('Activity says when the runs read fails', async ({ page }) => {
  await page.route('**/api/runs/recent*', (r) => r.fulfill({ status: 500, json: { error: 'database is locked' } }));
  await page.goto('/v2/#overview');
  await expect(page.locator('#ov-runs')).toContainText('Recent runs unavailable: database is locked. The next poll tries again.');
});

test('a failed stats read: the cards say unknown, and the budget shows no stale figures', async ({ page }) => {
  await page.route('**/api/stats*', (r) => r.fulfill({ status: 500, json: { error: 'stats unavailable' } }));
  await page.route('**/api/overview*', (r) => r.fulfill({ status: 500, json: { error: 'stats unavailable' } }));
  await page.goto('/v2/#overview');
  await expect(page.locator('#ov-main')).toContainText('Stats unknown: The stats feed could not be read');
  await expect(page.locator('#ov-budget')).toContainText('Spend unknown:');
  await expect(page.locator('#ov-llm')).toContainText('LLM spend unknown:');
  await expect(page.locator('#ov-hours')).toContainText('Runs unknown:');
  await expect(page.locator('#ov-head .ovkpi')).toHaveText('LLM, last hour unknown');
});

test('Runs by hour: the 24 h bars and the weekday heatmap, one tab stop with the keys', async ({ page }) => {
  await open(page);
  const h = page.locator('#ov-hours');
  await expect(h.locator('.cardhd .note')).toHaveText(/^\d+ runs?$/);
  const heat = h.getByRole('img', { name: /^Runs by weekday and hour, last 4 weeks/ });
  await heat.focus();
  await page.keyboard.press('ArrowRight');
  await expect(h.locator('[aria-live="polite"]').filter({ hasText: /^Mon, 0: \d+ runs?$/ })).toHaveCount(1);
});

test('Teams: the columns, the access tag, the spend and its sparkline, and the name link', async ({ page }) => {
  await open(page);
  const t = page.locator('#ov-teams');
  await expect(t.locator('th')).toHaveText(['Team', 'Now', 'Runs', 'PRs', 'Spend']);
  const row = t.locator('tr[data-team="example"]');
  await expect(row.getByRole('link', { name: 'Example' })).toHaveAttribute('href', '#teams/example');
  await expect(row.locator('td.bud b')).toHaveText(/^\$\d+\.\d\d$/);
  await expect(row.getByRole('img', { name: /^Example spend per day, last 30 days: the top day \$/ })).toBeVisible();
  await expect(t.locator('tr[data-team="fxa"]')).toContainText('everyone');
});

test('Budget and Teams: up to 3 capped teams, the rest as a link, meters at the cap, and a team that did not load', async ({ page }) => {
  await page.route('**/api/live*', (r) => r.fulfill({ contentType: 'text/event-stream', body: 'event: bye\ndata: {"reason":"off"}\n\n' }));
  const team = (profile: string, usd: number, cap: number) => ({ profile, label: profile, access: { open: true }, budget: { month_usd: usd, month_cap: cap } });
  const teams = [team('example', 60, 50), team('sample-a', 10, 100), team('sample-b', 95, 100), team('sample-c', 1, 100), { profile: 'sample-d', label: 'sample-d', load_error: true }];
  await page.route('**/api/teams', (r) => r.fulfill({ json: { teams, age_seconds: 1, error: null } }));
  await open(page);
  const b = page.locator('#ov-budget');
  await expect(b.locator('.cardhd')).toContainText(/^\w+ spend\$\d/);
  await expect(b.locator('.capr')).toHaveCount(3);
  await expect(b.locator('.capr').first()).toContainText('Over the cap.');
  await expect(b.getByRole('link', { name: '1 more capped team', exact: true })).toHaveAttribute('href', '#teams');
  const t = page.locator('#ov-teams');
  await expect(t.locator('tr[data-team="example"]').getByRole('img', { name: /^example: 120% of this month's cap$/ })).toBeVisible();
  await expect(t.locator('tr[data-team-error="sample-d"]')).toContainText('did not load');
  await expect(t.locator('tr[data-team="sample-d"]')).toHaveCount(0);
});

test('the layout: two columns from 1100 px, Teams under Activity; one column below, and Activity drops its icons at 420 px', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await open(page);
  const top = (s: string) => page.locator(s).evaluate((e) => e.getBoundingClientRect().top);
  const left = (s: string) => page.locator(s).evaluate((e) => e.getBoundingClientRect().left);
  expect(await left('#ov-budget')).toBeGreaterThan(await left('#ov-main'));
  expect(await left('#ov-teams')).toBe(await left('#ov-runs'));
  expect(await top('#ov-teams')).toBeGreaterThan(await top('#ov-runs'));
  await page.setViewportSize({ width: 1000, height: 900 });
  await expect.poll(async () => (await top('#ov-budget')) > (await top('#ov-teams'))).toBe(true);
  await page.setViewportSize({ width: 400, height: 900 });
  await expect(page.locator('#ov-runs .ovrun .ic').first()).toBeHidden();
});

test('the team picker: in the hash, the figures, the runs and the Teams row of one team', async ({ page }) => {
  await open(page);
  const pick = page.locator('[data-ovteam]');
  await expect(pick).toHaveValue('');
  const all = await page.locator('[data-ovmetric="runs"] .mv').textContent();
  await pick.selectOption('example');
  await expect(page).toHaveURL(/team=example/);
  await expect(page.locator('tr[data-team="example"]')).toHaveClass(/sel/);
  await expect(page.locator('[data-ovmetric="runs"] .mv')).not.toHaveText(all!);
  await expect(page.locator('#ov-llm .sub')).toContainText('Every team: the proxy does not log the team.');
  await expect(page.locator('#ov-runs .ovrun, #ov-runs .emptybox').first()).toBeVisible();
  for (const r of await page.locator('#ov-runs .ovrun .d').allTextContents()) expect(r).toContain('example');
  await pick.selectOption('');
  await expect(page).not.toHaveURL(/team=/);
});

test('the Overview: no running animation under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
});

for (const theme of ['light', 'dark'] as const) {
  test(`the Overview has no serious or critical axe issue in the ${theme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await open(page);
    for (const s of await page.locator('.ov summary').all()) await s.click();
    const { violations } = await new AxeBuilder({ page }).include('.ov').analyze();
    const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}
