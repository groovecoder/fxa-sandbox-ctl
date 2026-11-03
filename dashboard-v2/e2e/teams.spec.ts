// The Teams parity list of the design (section 6.7, part A), on the fallback polls with the team APIs mocked.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 900 } });

type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const now = () => Math.floor(Date.now() / 1000);
const GEN = '1792640520000005';

const teams = (): J[] => [
  { profile: 'example', label: 'Example', repos: [{ slug: 'example/app', role: 'work', write: true }], issues: [],
    access: { open: false, record: true, status: 'active', users: 2, listed: 2, channels: 0, jira: [] },
    test: { result: 'passed', at: now() - 3600, generation: GEN, tested: GEN },
    budget: { month: '2026-11', month_usd: 4.2, day_usd: 1, month_cap: 10, day_cap: null } },
  { profile: 'relay', label: 'Relay', repos: [{ slug: 'example/relay', role: 'work', write: true }], issues: [{ level: 'warn', text: 'nobody can start it' }],
    access: { open: false, record: true, status: 'draft', users: 0, listed: 0, channels: 0, jira: [] }, test: { result: null }, budget: null },
  { profile: 'fxa', label: 'FxA', repos: [{ slug: 'mozilla/fxa', role: 'work', write: true }], issues: [],
    access: { open: 'built-in', users: 0, channels: 0, jira: [] }, test: null,
    budget: { month: '2026-11', month_usd: 12.5, day_usd: 1, month_cap: null, day_cap: null } },
  { profile: 'broken', load_error: 'line 3: bad key' },
];
const record = (name: string, status = 'active'): J => ({
  schema: 1, name, label: name === 'relay' ? 'Relay' : 'Example', status,
  repos: [{ slug: `example/${name === 'relay' ? 'relay' : 'app'}`, role: 'work', default: true }], stack: { kind: 'none' },
  access: { open: false, users: name === 'relay' ? [] : ['UEXAMPLE1', 'UEXAMPLE2'], channels: [], jira_prefixes: [] },
  prompts: { goal_md: 'Example work.' }, caps: { usd_per_day: 5 }, secrets: { jira: 'EXAMPLE_JIRA' },
  generation: GEN, tested: status === 'active' ? GEN : null,
});

type Mock = { teams?: J[]; admin?: boolean; issues?: J[]; rec?: Record<string, J>; test?: Record<string, J>; audit?: J[]; summary?: J };
type Call = { url: string; body: J };

// The stream says bye off, so the page polls; the team reads answer from the mock, and every write is recorded.
async function mock(page: Page, m: Mock = {}) {
  const calls: Call[] = [], answers: Record<string, (b: J) => [number, J]> = {};
  const state = { teams: m.teams ?? teams(), rec: m.rec ?? { example: record('example'), relay: record('relay', 'draft') }, test: m.test ?? {} };
  const json = (r: Route, j: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(j) });
  await page.route('**/api/live*', (r) => r.fulfill({ contentType: 'text/event-stream', body: 'event: bye\ndata: {"reason":"off"}\n\n' }));
  await page.route('**/api/team-admin*', (r) => json(r, { admin: m.admin ?? true, user: 'user@example.com', teams: [] }));
  await page.route('**/api/routines/summary*', (r) => json(r, m.summary ?? { teams: { example: { routines: 2, failed: 0 } }, routines: {} }));
  await page.route(/\/api\/teams(\/.*)?(\?.*)?$/, (r) => {
    const u = new URL(r.request().url()), p = u.pathname.replace(/^\/api\/teams\/?/, '');
    if (r.request().method() === 'POST') {
      const body = r.request().postDataJSON() ?? {};
      calls.push({ url: u.pathname, body });
      const a = answers[u.pathname];
      const [st, j] = a ? a(body) : [200, { out: 'ok' }];
      return json(r, j, st);
    }
    if (!p) return json(r, { age_seconds: 5, issues: m.issues ?? [], teams: state.teams });
    const [team, sub] = p.split('/');
    if (team === 'people') return json(r, { at: 1, people: [{ id: 'UEXAMPLE3', name: 'Ann Example', handle: 'ann' }] });
    if (team === 'options') return json(r, { skills: ['fxa-verify'], boot: ['example'], mcp: ['jira', 'github'], caps: { usd_per_day: 50, usd_per_month: 500 } });
    const rec = state.rec[team!];
    if (!sub) return rec ? json(r, rec) : json(r, { error: 'no such team' }, 404);
    if (sub === 'secrets') return json(r, { EXAMPLE_JIRA: 'present' });
    if (sub === 'test') return json(r, state.test[team!] ?? { result: null, at: null, generation: GEN, tested: rec?.tested ?? null, started_at: null, lines: [] });
    if (sub === 'audit') return json(r, m.audit ?? []);
    if (sub === 'routine-channels') return json(r, { at: 1, channels: [] });
    return json(r, {});
  });
  return { calls, answers, state };
}
async function go(page: Page, hash: string) {
  await page.goto(`/v2/${hash}`);
  await expect(page.locator('#conn')).toHaveAttribute('data-mode', 'polling');
}
const main = (page: Page) => page.locator('#main');
const heading = (page: Page) => page.locator('#team-h');

test('routes: All teams, New team, a team tab, the legacy forms, and the heading focus after a navigation', async ({ page }) => {
  await mock(page);
  await go(page, '#teams');
  await expect(heading(page)).toHaveText('All teams');
  await expect(heading(page)).not.toBeFocused();
  await page.goto('/v2/#teams/new');
  await expect(heading(page)).toHaveText('New team');
  await expect(heading(page)).toBeFocused();
  await page.goto('/v2/#teams/example/settings');
  await expect(heading(page)).toContainText('Example');
  await expect(heading(page)).toBeFocused();
  await expect(page.locator('#team-tabs a[aria-current]')).toHaveText('Settings');
  // The v1 forms #teams/routines/<team> and #teams/memory/<team> rewrite to the team tab.
  await page.goto('/v2/#teams/routines/example');
  await expect(page).toHaveURL(/#teams\/example\/routines$/);
  await page.goto('/v2/#teams/nope');
  await expect(heading(page)).toHaveText('No team nope');
  await expect(main(page)).toContainText('It may have been deleted.');
});

test('side list: All teams row with meta, Needs attention, Teams, dots, search, and the narrow List toggle', async ({ page }) => {
  await mock(page);
  await go(page, '#teams');
  const side = page.locator('#side');
  await expect(side.locator('button.si[data-id="__all"]')).toContainText('4 teams');
  await expect(side.locator('button.si[data-id="__all"]')).toContainText('$16.70 this month');
  await expect(side.locator('h3.sgroup')).toHaveText(['Needs attention', 'Teams']);
  const ids = await side.locator('button.si').evaluateAll((b) => b.map((x) => x.getAttribute('data-id')));
  expect(ids[0]).toBe('__all');
  expect(ids.indexOf('broken')).toBeLessThan(ids.indexOf('example'));
  expect(ids.indexOf('relay')).toBeLessThan(ids.indexOf('example'));
  await expect(side.locator('button.si[data-id="broken"]')).toContainText('profile.conf did not load');
  await page.locator('#q').fill('example/relay');
  await expect(side.locator('button.si')).toHaveCount(1);
  await expect(side.locator('button.si')).toHaveAttribute('data-id', 'relay');
  await page.locator('#q').fill('');
  await page.setViewportSize({ width: 800, height: 800 });
  await expect(page.locator('#tlist')).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#tlist').click();
  await expect(page.locator('#tlist')).toHaveAttribute('aria-expanded', 'false');
});

test('All teams: New team link, issues alerts, four tiles, the draft card, the table and its sort', async ({ page }) => {
  await mock(page, { issues: [{ key: 'profiles/old', text: 'an old profile folder' }] });
  await go(page, '#teams');
  await expect(main(page).getByRole('link', { name: 'New team' })).toHaveAttribute('href', '#teams/new');
  await expect(main(page).locator('.alert.warn')).toContainText('an old profile folder');
  const tiles = main(page).locator('.tkpis');
  await expect(tiles).toContainText('Teams3');
  await expect(tiles).toContainText('2 active · 1 not set up');
  await expect(tiles).toContainText('$16.70');
  await expect(tiles).toContainText('FxA $12.50');
  await expect(tiles).toContainText('Needs attention1');
  await expect(tiles).toContainText('1 of 1');
  await expect(tiles.locator('[title="active record teams only"]')).toHaveCount(1);
  const draft = main(page).locator('a.tdraft');
  await expect(draft).toHaveAttribute('href', '#teams/relay/settings');
  await expect(draft).toContainText('Next: test and activate it.');
  await expect(draft).toContainText('1 step left');
  const names = () => main(page).locator('table[data-teams] tbody td:first-child').allTextContents();
  expect(await names()).toEqual(['Example', 'Relay', 'FxA', 'broken']);
  const row = main(page).locator('table[data-teams] tbody tr', { hasText: 'FxA' });
  await expect(row).toContainText('built in');
  await expect(main(page).locator('table[data-teams] tbody tr', { hasText: 'broken' })).toContainText('did not load');
  const cost = main(page).getByRole('button', { name: 'Cost this month' });
  await cost.click();
  await expect(main(page).locator('th[aria-sort="ascending"]')).toContainText('Cost this month');
  expect(await names()).toEqual(['Relay', 'broken', 'Example', 'FxA']);
  await cost.click();
  await expect(main(page).locator('th[aria-sort="descending"]')).toContainText('Cost this month');
  expect((await names())[0]).toBe('FxA');
  await cost.click();
  await expect(main(page).locator('th[aria-sort]')).toHaveCount(0);
});

test('All teams: a viewer who is not an admin sees no New team link and no draft cards', async ({ page }) => {
  await mock(page, { admin: false });
  await go(page, '#teams');
  await expect(heading(page)).toHaveText('All teams');
  await expect(main(page).getByRole('link', { name: 'New team' })).toHaveCount(0);
  await expect(main(page).locator('a.tdraft')).toHaveCount(0);
  await page.goto('/v2/#teams/new');
  await expect(main(page)).toContainText('Only a team admin can create a team.');
});

test('New team: client checks with aria-invalid, the server 409, the payload, and the settings page after create', async ({ page }) => {
  const m = await mock(page);
  await go(page, '#teams/new');
  await page.locator('#nt-name').fill('new-one');
  await expect(main(page)).toContainText('It shows as New One.');
  await expect(main(page)).toContainText('0 of 2560');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.locator('#nt-repo')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#nt-repo')).toHaveAttribute('aria-describedby', 'nt-repo-err');
  await expect(page.locator('#nt-repo')).toBeFocused();
  expect(m.calls).toEqual([]);
  await page.locator('#nt-repo').fill('example/new-one');
  await page.getByRole('radio', { name: /No FxA stack/ }).check();
  await page.locator('#nt-goal').fill('Example work.');
  m.answers['/api/teams'] = () => [409, { error: 'exists' }];
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.locator('#nt-name-err')).toHaveText('A team with this name already exists.');
  await expect(page.locator('#nt-name')).toBeFocused();
  const rec = m.calls[0]!.body.record;
  expect(rec).toMatchObject({ name: 'new-one', status: 'draft', repos: [{ slug: 'example/new-one', role: 'work' }], stack: { kind: 'none' }, prompts: { goal_md: 'Example work.' } });
  m.answers['/api/teams'] = () => [200, { out: 'created' }];
  m.state.rec['new-one'] = { ...record('new-one', 'draft'), name: 'new-one', label: 'New One' };
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page).toHaveURL(/#teams\/new-one\/settings$/);
  await expect(main(page)).toContainText('The team list updates in a minute.');
});

test('team page: state tag, sub line, tabs with the Routines count, and a draft shows Settings "1 left" and Routines only', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('keys', '1'));
  await mock(page, { summary: { teams: { example: { routines: 3, failed: 1, last_failed: { name: 'Nightly', reason: 'cap' } } }, routines: {} } });
  await go(page, '#teams/example');
  await expect(heading(page)).toContainText('active');
  await expect(main(page).locator('.readback')).toHaveText('2 people can start Example.');
  const tabs = page.locator('#team-tabs a');
  await expect(tabs).toHaveText(['Overview', 'Routines31 failed', 'Memory', 'Settings']);
  await page.goto('/v2/#teams/relay');
  await expect(tabs).toHaveText(['Settings1 left', 'Routines']);
  await expect(page.locator('#team-tabs a[aria-current]')).toHaveText('Settings1 left');
  await expect(main(page)).toContainText('Nobody can start Relay yet.');
  // h and l step over the tabs that the page shows.
  await page.locator('body').press('l');
  await expect(page).toHaveURL(/#teams\/relay\/routines$/);
  await expect(main(page)).toContainText('Routines run only when the team is active.');
  await page.locator('body').press('l');
  await expect(page).toHaveURL(/#teams\/relay\/settings$/);
  await page.goto('/v2/#teams/broken');
  await expect(main(page)).toContainText('profile.conf did not load.');
});

test('Overview: the banner with its action, the tiles, the Activity chart by keyboard and its table, and the links', async ({ page }) => {
  await mock(page, { summary: { teams: { example: { routines: 2, failed: 2, last_failed: { name: 'Nightly', reason: 'the cap' } } }, routines: {} } });
  await go(page, '#teams/example');
  const banner = main(page).locator('.tbanner[role="alert"]');
  await expect(banner).toContainText('2 routines failed');
  await expect(banner).toContainText('Nightly: the cap');
  await expect(banner.getByRole('link', { name: 'Open Routines' })).toHaveAttribute('href', '#teams/example/routines');
  await expect(main(page)).toContainText('Cost this month');
  await expect(main(page)).toContainText('Active now');
  await expect(main(page)).toContainText('Open errors');
  await expect(main(page)).toContainText('Last profile test');
  const chart = main(page).getByRole('img', { name: /sessions and runs in 30 days/ });
  await chart.focus();
  await page.keyboard.press('End');
  await expect(main(page).getByText(/: \d+ sessions? (and|or) runs?, Slack \$/).first()).toBeVisible();
  await main(page).getByText('Show as table').first().click();
  await expect(main(page).getByRole('columnheader', { name: 'Sessions and runs' })).toBeVisible();
  await main(page).getByRole('link', { name: 'Its spend in Stats' }).click();
  await expect(page).toHaveURL(/#stats/);
});

test('Overview: "Its sessions" opens Sessions with the Team chip, as v1 sets STEAM', async ({ page }) => {
  await mock(page);
  await go(page, '#teams/example');
  await main(page).getByRole('link', { name: 'Its sessions' }).click();
  await expect(page).toHaveURL(/#sessions\/\w+\?team=example$/);
  await expect(page.getByRole('button', { name: /Clear the team filter/ })).toHaveText('Team: Example ×');
});

test('Overview: the first banner with "and N more" and its action for an admin, the ask line for a viewer who is not one', async ({ browser }) => {
  const ts = teams().map((t) => (t.profile === 'example' ? { ...t, issues: [{ level: 'warn', text: 'nobody can start it' }] } : t));
  const summary = { teams: { example: { routines: 2, failed: 1 } }, routines: {} };
  let page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await mock(page, { teams: ts, summary });
  await go(page, '#teams/example');
  const banner = main(page).locator('.tbanner[role="alert"]');
  await expect(banner).toContainText('Nobody can start this team and 1 more');
  await expect(banner.getByRole('link', { name: 'Add users' })).toHaveAttribute('href', '#teams/example/settings');
  await page.close();
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await mock(page, { teams: ts, summary, admin: false });
  await go(page, '#teams/example');
  await expect(main(page).locator('.tbanner[role="alert"]')).toContainText('Nobody can start this team');
  await expect(main(page).locator('.tbanner')).not.toContainText('and 1 more');
  await expect(main(page).locator('.tbanner')).toContainText('A team admin can fix this. Ask the operator.');
  await expect(main(page).locator('.tbanner a')).toHaveCount(0);
  await page.close();
});

test('Settings, read-only: who can start it, repos with shipping, Tools, Mode and Runs on', async ({ page }) => {
  await mock(page);
  await go(page, '#teams/fxa/settings');
  await expect(main(page)).toContainText('Who can start itEveryone');
  await expect(main(page)).toContainText('mozilla/fxawork · opens a draft PR');
  await expect(main(page)).toContainText('Toolsbot default (MCP_CONNECTORS)');
  await expect(main(page)).toContainText('Modedraft PRs');
  await expect(main(page)).toContainText('The operator changes the FxA team in profiles/fxa/ in the repo.');
  await expect(main(page).getByRole('heading', { name: 'Runs on' })).toBeVisible();
});

test('Settings, record: test and activate on a pass, with the POST paths of v1', async ({ page }) => {
  const m = await mock(page);
  await page.clock.install();
  await go(page, '#teams/relay/settings');
  const card = main(page);
  await expect(card.locator('.ck', { hasText: 'Test and activate' })).toContainText('Boots one runner with this setup.');
  m.answers['/api/teams/relay/test'] = () => [409, { error: 'a test runs' }];
  m.state.test.relay = { result: 'running', started_at: now() - 120, generation: GEN, lines: ['boot: ok'] };
  await card.locator('[data-ttest]').click();
  await expect(card).toContainText('Running since');
  await expect(card).toContainText('Relay turns on when it passes.');
  m.state.test.relay = { result: 'passed', generation: GEN, tested: GEN, lines: [] };
  // While polling, the card reads the test again each 10 s.
  await page.clock.runFor(11000);
  await expect.poll(() => m.calls.map((c) => c.url)).toContain('/api/teams/relay/status');
  expect(m.calls.find((c) => c.url === '/api/teams/relay/status')!.body).toEqual({ status: 'active' });
  expect(m.calls.filter((c) => c.url === '/api/teams/relay/status')).toHaveLength(1);
});

test('Settings, record: Turn off and Delete arm on the first click and act on the second', async ({ page }) => {
  const m = await mock(page);
  await go(page, '#teams/example/settings');
  const off = main(page).getByRole('button', { name: 'Turn off', exact: true });
  await off.click();
  await expect(main(page).getByRole('button', { name: 'Turn off: click again' })).toBeVisible();
  expect(m.calls).toEqual([]);
  await main(page).getByRole('button', { name: 'Turn off: click again' }).click();
  await expect(main(page)).toContainText('The team is off.');
  expect(m.calls.at(-1)).toEqual({ url: '/api/teams/example/status', body: { status: 'disabled' } });
  const del = main(page).getByRole('button', { name: 'Delete Example', exact: true });
  await del.click();
  await expect(main(page).getByRole('button', { name: 'Delete Example: click again' })).toBeFocused();
  // The arm goes when the button loses the focus.
  await page.keyboard.press('Tab');
  await expect(main(page).getByRole('button', { name: 'Delete Example', exact: true })).toBeVisible();
  await main(page).getByRole('button', { name: 'Delete Example', exact: true }).click();
  await main(page).getByRole('button', { name: 'Delete Example: click again' }).click();
  await expect(page).toHaveURL(/#teams$/);
  expect(m.calls.at(-1)!.url).toBe('/api/teams/example/delete');
});

test('Settings, record: an item form saves the whole record with the generation, 409 says Cancel, then redo', async ({ page }) => {
  const m = await mock(page);
  await go(page, '#teams/example/settings');
  await main(page).locator('[data-tf="caps"]').click();
  const form = main(page).locator('[data-tform]');
  await expect(form.locator('input').first()).toBeFocused();
  await expect(main(page).locator('[data-tf="goal"]')).toBeDisabled();
  m.answers['/api/teams/example'] = () => [409, { error: 'generation' }];
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form).toContainText('Cancel, then redo your edit.');
  const body = m.calls[0]!.body;
  expect(body.generation).toBe(GEN);
  expect(body.record).toMatchObject({ name: 'example', status: 'active', prompts: { goal_md: 'Example work.' }, caps: { usd_per_day: 5 } });
  expect(body.record.generation).toBeUndefined();
  await form.getByRole('button', { name: 'Cancel' }).click();
  await expect(main(page).locator('[data-tform]')).toHaveCount(0);
});

test('Settings, record: a runner change on an active team warns and saves as a draft, then starts the test', async ({ page }) => {
  const m = await mock(page);
  await go(page, '#teams/example/settings');
  await main(page).getByText('How it runs').click();
  await main(page).locator('[data-tf="skills"]').click();
  const form = main(page).locator('[data-tform]');
  await form.getByRole('checkbox', { name: 'fxa-verify' }).check();
  await expect(form.locator('.alert.warn')).toContainText('This change needs a new test.');
  await form.getByRole('button', { name: 'Save and test again' }).click();
  await expect.poll(() => m.calls.map((c) => c.url)).toEqual(['/api/teams/example', '/api/teams/example/test']);
  expect(m.calls[0]!.body.record).toMatchObject({ status: 'draft', skills: ['fxa-verify'] });
});

test('Settings, record: the people picker searches after 2 characters and adds a person', async ({ page }) => {
  const m = await mock(page);
  await go(page, '#teams/example/settings');
  await main(page).locator('[data-tf="access"]').click();
  const form = main(page).locator('[data-tform]');
  const q = form.locator('input[id^="tf-pq-"]');
  await q.fill('a');
  await expect(form.locator('[data-tfpick]')).toHaveCount(0);
  await q.fill('ann');
  await form.locator('[data-tfpick]').first().click();
  await expect(q).toBeFocused();
  await expect(form).toContainText('Ann Example');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => m.calls.length).toBe(1);
  expect(m.calls[0]!.body.record.access.users).toEqual(['UEXAMPLE1', 'UEXAMPLE2', 'UEXAMPLE3']);
});

test('Settings, record: the JSON editor validates and saves, a 409 says so, and History shows the test pass', async ({ page }) => {
  const m = await mock(page, { audit: [{ at: now() - 60, action: 'update', actor: 'user@example.com', changed: 'caps', new_gen: GEN }] });
  await go(page, '#teams/example/settings');
  await main(page).getByText('Edit the record as JSON').click();
  await main(page).getByRole('button', { name: 'Load the record' }).click();
  const box = main(page).getByRole('textbox', { name: 'Team record JSON' });
  await expect(box).toContainText('"name": "example"');
  await box.fill('{ nope');
  await main(page).getByRole('button', { name: 'Validate' }).click();
  await expect(main(page)).toContainText('Not JSON:');
  await box.fill('{"name": "example"}');
  m.answers['/api/teams/validate'] = () => [200, { out: 'valid' }];
  await main(page).getByRole('button', { name: 'Validate' }).click();
  await expect(main(page).locator('.tmore-card p.prewrap')).toHaveText('valid');
  m.answers['/api/teams/example'] = () => [409, { error: 'generation' }];
  await main(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(main(page)).toContainText('Someone changed this team after you loaded it. Load the record again and redo your edit.');
  expect(m.calls.at(-1)).toEqual({ url: '/api/teams/example', body: { record: { name: 'example' }, generation: GEN } });
  await main(page).getByText('History').click();
  const tl = main(page).getByRole('list', { name: 'Changes, newest first' });
  await expect(tl).toContainText('update by user: caps');
  await expect(tl).toContainText('test passed here');
});

for (const theme of ['light', 'dark'] as const) {
  test(`Teams has no serious or critical axe issue in the ${theme} theme`, async ({ page }) => {
    await mock(page);
    await page.emulateMedia({ colorScheme: theme });
    const bad: string[] = [];
    for (const h of ['#teams', '#teams/new', '#teams/example', '#teams/example/settings', '#teams/relay/settings', '#teams/fxa/settings']) {
      await page.goto(`/v2/${h}`);
      await expect(heading(page)).toBeVisible();
      await expect(main(page).locator('.empty:visible', { hasText: 'loading' })).toHaveCount(0);
      const { violations } = await new AxeBuilder({ page }).include('#main').analyze();
      bad.push(...violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${h} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`));
    }
    expect(bad).toEqual([]);
  });
}
