// The Overview on the basic live fixture; the recent runs come from the v1 Overview page fixture.
import { readFileSync } from 'node:fs';
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


