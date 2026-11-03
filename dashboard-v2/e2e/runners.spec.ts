// Sandboxes (design 6.6): the parity list as tests, on the v1 page fixtures through serve.py --fixture, plus axe in both themes.
import AxeBuilder from '@axe-core/playwright';
import { spawn } from 'node:child_process';
import { createServer, type AddressInfo } from 'node:net';
import { expect, test, type Page } from '@playwright/test';

type J = ReturnType<typeof JSON.parse>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise<number>((r) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as AddressInfo).port; s.close(() => r(p)); }); });

// One server per v1 page fixture: the page polls it, as parity-v2.sh does.
const servers: Record<string, { url: string; stop: () => void }> = {};
async function serve(fixture: string) {
  if (servers[fixture]) return servers[fixture].url;
  const port = await freePort();
  const p = spawn('python3', ['e2e/serve.py', '--port', String(port), '--fixture', `../skills/fxa-ctl-dev/page-fixture-${fixture}.json`], { stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    if (await fetch(`${url}/v2/`).then((r) => r.ok, () => false)) break;
    await sleep(100);
  }
  servers[fixture] = { url, stop: () => p.kill() };
  return url;
}
test.afterAll(() => Object.values(servers).forEach((s) => s.stop()));
test.use({ viewport: { width: 1440, height: 1000 } });

// edit changes an API answer before the page reads it, as a v1 check edits AGENTS.
async function edit(page: Page, path: string, f: (j: J) => J | void) {
  await page.route(`**${path}*`, async (route) => {
    const res = await route.fetch();
    const j = await res.json();
    await route.fulfill({ response: res, json: f(j) ?? j });
  });
}
const agents = (page: Page, f: (a: J, j: J) => void) => edit(page, '/api/snapshot', (j) => { f(j.agents, j); });
async function open(page: Page, hash = '#runners/all', fixture = 'sandboxes') {
  // Refresh polls the snapshot again; the fixture server's own feed rebuild would fail and set agents_error.
  await page.route('**/api/refresh', (r) => r.fulfill({ json: { ok: true } }));
  await page.goto(`${await serve(fixture)}/v2/${hash}`);
  await expect(page.locator('#sb-list')).toBeVisible();
}
const list = (page: Page) => page.locator('#sb-list');
const keys = (page: Page) => list(page).locator('[data-sbsel]').allTextContents();
const now = () => Math.floor(Date.now() / 1000);

test.describe('the list', () => {
  test('live rows then Needs a fix · 3, commands in code outside the buttons, the held slot steps, the free and age lines, the badge', async ({ page }) => {
    await open(page);
    await expect(list(page).locator('.sbl').first().locator('[data-sbsel]')).toHaveText(['Pipeline EX-101', 'Pipeline EX-102', 'Slack agent-ex0001', 'Nightly review', 'Slack agent-ex0003']);
    await expect(list(page).locator('thead').first().locator('th')).toHaveText(['For', 'What', 'Now', 'Team', 'Where', 'Time', 'LLM cost']);
    await expect(list(page).locator('h3.sbh').first()).toHaveText('Needs a fix · 3');
    await expect(list(page).locator('code')).toHaveText(['fxa-sandbox-ctl stop agent-ex0004', 'fxa-sandbox-ctl stop agent-41c0e6']);
    await expect(list(page).locator('button code, button .steps')).toHaveCount(0);
    await expect(list(page)).toContainText('ex-auto-4 is not free for a launch. Its last ticket EX-130 is not in flight.');
    await expect(list(page).locator('.steps')).toContainText('fxa-sandbox-ctl slots');
    await expect(list(page).locator('.sbfree')).toHaveText('ex-auto-3 · held for a run in flight: ex-auto-5 (EX-103) · 2 session slots');
    await expect(list(page).locator('.sbage')).toHaveText(/^Agents read \d+s ago · the next read in about \d+ s$/);
    await expect(page.locator('#n-runners')).toHaveText('3');
    await expect(page.locator('#n-runners')).toHaveAttribute('aria-label', '3 sandboxes need a fix');
    await expect(page.getByRole('button', { name: 'Pipeline EX-101, details' })).toBeVisible();
    await expect(list(page).locator('tr', { hasText: 'Pipeline EX-101' })).toContainText('15m of 1.5h$1.25');
  });

  test('the tabs filter the list', async ({ page }) => {
    await open(page, '#runners/pipeline');
    await expect.poll(() => keys(page)).toEqual(['Pipeline EX-101', 'Pipeline EX-102', 'Pipeline agent-agent-41c0e6', 'Pipeline EX-130']);
    await page.goto(page.url().replace('#runners/pipeline', '#runners/slack'));
    await expect.poll(() => keys(page)).toEqual(['Slack agent-ex0001', 'Slack agent-ex0003', 'Slack agent-ex0004']);
    await page.locator('#vtabs a', { hasText: 'Routines' }).click();
    await expect.poll(() => keys(page)).toEqual(['Nightly review']);
  });

  test('a non-admin sees no routine name and no routine link; the Routines tab says why', async ({ page }) => {
    await edit(page, '/api/team-admin', () => ({ admin: false }));
    await open(page);
    await expect(list(page)).toContainText('Routine · scheduled run');
    await expect(list(page)).not.toContainText('Nightly review');
    await page.locator('#vtabs a', { hasText: 'Routines' }).click();
    await expect(list(page)).toHaveText('Only a team admin can see routine runs.');
    await expect(page.locator('#sb-done')).toContainText('Only a team admin can see routine runs.');
  });

  test('feed text never becomes markup, and a command shows only for a safe name', async ({ page }) => {
    await agents(page, (a) => {
      a.instances.push({ name: 'agent-x;rm -rf ~', state: 'terminated', age_seconds: 9000, where: 'gce' });
      a.sessions[0].request = '<img src=x onerror=alert(1)>';
    });
    await open(page);
    await expect(list(page)).toContainText('<img src=x onerror=alert(1)>');
    await expect(list(page).locator('img')).toHaveCount(0);
    await expect(list(page)).toContainText('agent-x;rm -rf ~');
    expect((await list(page).locator('code').allTextContents()).some((c) => /rm -rf/.test(c))).toBe(false);
  });

  test('a normal stop is stopping with no command; 10 min after the stop it is a fix row', async ({ page }) => {
    await agents(page, (a) => { a.sessions.find((x: J) => x.key === 'agent-ex0003').stopped_at = now() - 700; });
    await open(page);
    await expect(list(page).locator('code')).toContainText(['fxa-sandbox-ctl stop agent-ex0003']);
    await expect(page.locator('#n-runners')).toHaveText('4');
  });

  test('a stale feed keeps its rows under a warning, with no command and no free line, and the badge says ?', async ({ page }) => {
    await agents(page, (_, j) => { j.agents_age_seconds = 600; });
    await open(page);
    await expect(list(page).locator('.sbstale')).toHaveText('The agents feed is 10 min old: these rows may be out of date.');
    await expect(list(page).locator('tbody tr').first()).toBeVisible();
    await expect(list(page).locator('code')).toHaveCount(0);
    await expect(list(page).locator('.sbfree')).toHaveCount(0);
    await expect(page.locator('#n-runners')).toHaveText('?');
    await expect(page.locator('#n-runners')).toHaveAttribute('aria-label', 'Sandbox fixes unknown: the agents feed could not be read');
  });

  test('nothing runs; nothing set up; the feed failed; before the first read', async ({ browser }) => {
    let page = await browser.newPage();
    await agents(page, (a) => {
      a.runners = []; a.sessions = []; a.instances = [];
      a.pool = a.pool.map((x: J) => ({ ...x, agent: null, busy: false, key: null }));
      a.free_slots = a.pool.map((x: J) => x.slot);
    });
    await open(page);
    await expect(list(page).getByText('No sandbox runs now.')).toBeVisible();
    await expect(page.locator('#n-runners')).toHaveText('');
    await page.close();
    page = await browser.newPage();
    await agents(page, (a) => { a.runners = []; a.sessions = []; a.instances = []; a.pool = []; a.free_slots = []; });
    await open(page);
    await expect(list(page).getByText('No sandbox slot is set up, and no Slack session is live.')).toBeVisible();
    await page.close();
    page = await browser.newPage();
    await agents(page, (_, j) => { j.agents_error = 'boom'; });
    await open(page);
    await expect(list(page)).toHaveText('Sandboxes unknown: the agents feed could not be read.');
    await expect(page.locator('#sb-cards .big')).toHaveText(['?', '?', '?']);
    await page.close();
    page = await browser.newPage();
    await page.route('**/api/snapshot*', () => {});
    await page.goto(`${await serve('sandboxes')}/v2/#runners/all`);
    await expect(list(page)).toHaveText('Loading…');
    await page.close();
  });

  test('a moving instance behind a run gets no command; one with no run behind it is unknown', async ({ page }) => {
    await agents(page, (a) => {
      a.instances.push({ name: 'agent-agent-ex0001', state: 'provisioning', age_seconds: 400, where: 'gce' }, { name: 'agent-agent-nn0001', state: 'staging', age_seconds: null });
      a.instances.find((v: J) => v.name === 'agent-ex-101').state = 'staging';
    });
    await open(page);
    await expect(list(page).locator('tr', { hasText: 'Pipeline EX-101' })).toContainText('starting');
    await expect(list(page).locator('tr', { hasText: 'Slack agent-ex0001' })).toContainText('starting');
    await expect(list(page).locator('.sbfree')).toContainText('agent-agent-nn0001 is staging, with no run behind it');
  });

  test('390 px: no sideways scroll, no side list', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await open(page);
    await expect(page.locator('.sbv svg').first()).toBeVisible();
    // The charts take their width from a ResizeObserver, one frame after the first paint.
    await expect.poll(() => page.evaluate(() => { const m = document.getElementById('main')!; return document.documentElement.scrollWidth <= innerWidth && m.scrollWidth <= m.clientWidth; })).toBe(true);
    await expect(page.locator('#side')).toBeHidden();
  });
});

test.describe('the selection and the details', () => {
  test('a row opens its details; the selection is in the hash, with .sel and aria-current', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Slack agent-ex0001, details' }).click();
    await expect(page).toHaveURL(/#runners\/all\/sess%3Aagent-ex0001$/);
    const tr = list(page).locator('tr.sel');
    await expect(tr).toHaveAttribute('aria-current', 'true');
    await expect(tr.locator('[data-sbsel]')).toHaveText('Slack agent-ex0001');
    const r = page.locator('#right');
    await expect(r.locator('h2')).toHaveText('make the sample page fasterSlack session');
    await expect(r.getByRole('link', { name: 'Open the session' })).toHaveAttribute('href', '#sessions/live/agent-ex0001');
    await expect(r).toContainText('Boot');
    await expect(r).toContainText('not recorded yet');
    // A reload keeps the selection: it is in the hash.
    await page.reload();
    await expect(page.locator('#right h2')).toHaveText('make the sample page fasterSlack session');
  });

  test('a pipeline row, a fix row and a routine row as a non-admin', async ({ page }) => {
    await edit(page, '/api/team-admin', () => ({ admin: false }));
    await open(page);
    const r = page.locator('#right');
    await page.getByRole('button', { name: 'Pipeline EX-101, details' }).click();
    await expect(r.locator('h2 a')).toHaveAttribute('href', '#pipeline/belts/EX-101');
    await expect(r).toContainText('Slotex-auto-1');
    await expect(r).toContainText('Boot steps and peak memory are not recorded for pipeline runs.');
    await page.getByRole('button', { name: 'Slack agent-ex0004, details' }).click();
    await expect(r.locator('h2')).toHaveText('agent-ex0004Needs a fix');
    await expect(r.locator('code')).toHaveText('fxa-sandbox-ctl stop agent-ex0004');
    await page.getByRole('button', { name: 'Routine · scheduled run, details' }).click();
    await expect(r.locator('h2')).toHaveText('Routine · scheduled runRoutine run');
    await expect(r.locator('a')).toHaveCount(0);
    await expect(r).not.toContainText('Nightly');
  });

  test('the boot steps show as a waterfall with a table', async ({ page }) => {
    await agents(page, (a) => { a.sessions[0].boot_s = 32; a.sessions[0].boot_steps = JSON.stringify([{ step: 'vm', s: 12 }, { step: 'clone', s: 20 }]); });
    await open(page, '#runners/all/sess%3Aagent-ex0001');
    const f = page.locator('#right figure');
    await expect(f.getByRole('img')).toHaveAccessibleName('Boot steps: 2 steps in 32 s; the longest is clone, 20 s.');
    await f.getByText('Show as table').click();
    await expect(f.locator('tbody tr')).toHaveText(['vm12', 'clone20']);
  });

  test('a row that leaves the list clears the selection and moves the focus to the list', async ({ page }) => {
    let gone = false;
    await agents(page, (a) => { if (gone) a.sessions = a.sessions.filter((x: J) => x.key !== 'agent-ex0001'); });
    // The r key refreshes, so the focus stays in the panel.
    await page.addInitScript(() => localStorage.setItem('keys', '1'));
    await open(page);
    await page.getByRole('button', { name: 'Slack agent-ex0001, details' }).click();
    await page.locator('#right a').first().focus();
    gone = true;
    await page.keyboard.press('r');
    await expect(page).toHaveURL(/#runners\/all$/, { timeout: 10000 });
    await expect(page.locator('#sb-list')).toBeFocused();
    await expect(page.locator('.sbv > p[aria-live]')).toHaveText('The selected sandbox left the list.');
  });

  test('a deep link keeps the last panel when the agents feed is unknown', async ({ page }) => {
    let fail = false;
    await agents(page, (_, j) => { if (fail) j.agents_error = 'boom'; });
    await open(page, '#runners/all/sess%3Aagent-ex0001');
    await expect(page.locator('#right h2')).toContainText('make the sample page faster');
    fail = true;
    await page.locator('#refresh').click();
    await expect(page.locator('#right')).toContainText('The agents feed is unknown: this panel may be out of date.', { timeout: 10000 });
    await expect(page.locator('#right h2')).toContainText('make the sample page faster');
    await expect(page).toHaveURL(/sess%3Aagent-ex0001$/);
  });
});

test.describe('the cards, the timeline and the slots', () => {
  test('the cards: slots with their strip, the 7 day lines, the cost lines and the Stats link', async ({ page }) => {
    await open(page, '#runners/all', 'sb-cards');
    const c = page.locator('#sb-cards');
    await expect(c.locator('.big')).toHaveText(['2 of 5 busy', '1 of 4 busy']);
    await expect(c.locator('.sbstrip').first()).toHaveAttribute('aria-label', '2 busy, 3 free, 0 held');
    await expect(c.locator('.sbstrip').first().locator('i')).toHaveCount(5);
    await expect(c.locator('.sbstrip i').first()).toHaveAttribute('title', 'ex-auto-1: EX-101');
    await expect(c).toContainText('3 more may launch');
    await expect(c).toContainText(/7 days: \d+ runs, [\d.]+ h/);
    await expect(c).toContainText('$0.21/h · $35 in 7 days, always on');
    await expect(c).toContainText('Firecracker host stopped: it starts for the next session');
    await expect(c).toContainText('$0.13/h');
    await expect(c.getByRole('link', { name: 'LLM spend is on Stats ›' })).toHaveAttribute('href', '#stats/spend');
  });

  test('the cards before the first stats read say Loading, and a GCE session is hatched', async ({ page }) => {
    await page.route('**/api/stats*', () => {});
    await agents(page, (a) => { a.sessions.push({ key: 'agent-ex0002', state: 'active', boot_backend: 'gce', created: now() - 60 }); });
    await open(page, '#runners/all', 'sb-cards');
    await expect(page.locator('#sb-cards')).toContainText('7 days: Loading the stats…');
    await expect(page.locator('#sb-cards .sbstrip i.gce')).toHaveCount(1);
    await expect(page.locator('#sb-cards')).toContainText('1 on GCE');
  });

  test('the timeline: one row per sandbox, the summary, the keys select a row, an over-cap run says so', async ({ page }) => {
    await agents(page, (a) => { a.runners[0].elapsed_seconds = 6000; });
    await open(page);
    const img = page.getByRole('img', { name: /^Runner timeline:/ });
    await expect(img).toHaveAccessibleName('Runner timeline: 5 sandboxes run now, 1 over cap, 2 need a fix.');
    await expect(list(page).locator('.over')).toHaveText('1.7h of 1.5h · over cap');
    await img.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#runners\/all\/pipe%3Aex-auto-1$/);
    await expect(page.locator('#right h2')).toContainText('EX-101');
  });

  test('the slot grid: a word on each tile', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('list', { name: 'Pipeline slots' }).locator('li')).toHaveText(['ex-auto-1running', 'ex-auto-2running', 'ex-auto-3free', 'ex-auto-4fix', 'ex-auto-5held']);
    await expect(page.getByRole('list', { name: 'Session slots' }).locator('li')).toHaveText(['Slot 1running', 'Slot 2running · GCE', 'Slot 3free', 'Slot 4free']);
  });
});

test.describe('Recently completed', () => {
  test('the server order, the columns, the links, the scatter', async ({ page }) => {
    await open(page, '#runners/all', 'sb-done');
    const d = page.locator('#sb-done');
    await expect(d.locator('[data-sbdone]')).toHaveCount(2);
    await expect(d.locator('.sbd-scroll thead th')).toHaveText(['Ended', 'Source', 'For', 'Team', 'Where', 'Boot', 'Peak memory', 'Time', 'LLM cost', 'Result']);
    await expect(d.locator('a[href="https://github.com/example/repo/pull/41"]')).toBeVisible();
    await expect(d.getByRole('link', { name: 'All sessions ›' })).toHaveAttribute('href', '#sessions');
    await expect(d.getByRole('link', { name: 'Stats ›' })).toHaveAttribute('href', '#stats');
    await expect(d.getByRole('img', { name: /^Time against LLM cost for \d+ recent runs/ })).toBeVisible();
  });

  test('at most 20 rows; a failed read keeps the rows with a note; a failed first read is unknown', async ({ browser }) => {
    let page = await browser.newPage();
    let n = 0;
    await page.route('**/api/runs/recent*', (r) => (n++ === 0
      ? r.fulfill({ json: { runs: Array.from({ length: 25 }, (_, i) => ({ src: 'slack', key: `agent-ex${String(i).padStart(4, '0')}`, outcome: 'answered', end: now() - i * 60, min: i, usd: i / 10 })) } })
      : r.fulfill({ status: 503, json: {} })));
    await open(page);
    await expect(page.locator('#sb-done [data-sbdone]')).toHaveCount(20);
    await page.locator('#refresh').click();
    await expect(page.locator('#sb-done')).toContainText('Recently completed may be out of date: HTTP 503.', { timeout: 15000 });
    await expect(page.locator('#sb-done [data-sbdone]')).toHaveCount(20);
    await page.close();
    page = await browser.newPage();
    await page.route('**/api/runs/recent*', (r) => r.fulfill({ json: { runs: [], error: 'stats unavailable' } }));
    await open(page);
    await expect(page.locator('#sb-done')).toContainText('Recently completed unknown: stats unavailable. The next poll tries again.');
    await page.close();
  });

  test('the tab asks for its source; an older answer that comes late is dropped', async ({ page }) => {
    const asked: string[] = [];
    await page.route('**/api/runs/recent*', async (r) => {
      const u = r.request().url();
      asked.push(u.split('?')[1]!);
      if (!u.includes('src=')) await sleep(1500);
      await r.fulfill({ json: { runs: u.includes('src=pipeline') ? [{ src: 'pipeline', key: 'EX-9', outcome: 'pr', end: now() }] : [{ src: 'slack', key: 'agent-old001', outcome: 'answered', end: now() }] } });
    });
    await open(page);
    await page.locator('#vtabs a', { hasText: 'Pipeline' }).click();
    await expect(page.locator('#sb-done [data-sbdone]')).toHaveText([/EX-9/]);
    await sleep(2000);
    await expect(page.locator('#sb-done [data-sbdone]')).toHaveText([/EX-9/]);
    expect(asked.slice(0, 2)).toEqual(['ended=1&limit=100', 'ended=1&limit=100&src=pipeline']);
  });
});

for (const theme of ['light', 'dark']) {
  test(`#runners has no serious or critical axe issue in the ${theme} theme`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
    await agents(page, (a) => { a.sessions[0].boot_steps = JSON.stringify([{ step: 'vm', s: 12 }, { step: 'clone', s: 20 }]); });
    await open(page, '#runners/all/sess%3Aagent-ex0001');
    await expect(page.locator('#sb-done [data-sbdone]').first()).toBeVisible();
    for (const s of await page.locator('.sbv details, #right details').all()) await s.locator('summary').click();
    const { violations } = await new AxeBuilder({ page }).include('.sbv').include('#right').analyze();
    expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
  });
}
