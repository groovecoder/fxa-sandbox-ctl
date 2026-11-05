// The Teams parity list of the design (section 6.7, part A), on the fallback polls with the team APIs mocked.
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








test('Settings, repos: a repo set to Append saves commits append in the record', async ({ page }) => {
  const m = await mock(page);
  await go(page, '#teams/example/settings');
  await main(page).locator('[data-tf="repos"]').click();
  const form = main(page).locator('[data-tform]');
  const pick = form.getByLabel('Commits of repo 1');
  await expect(pick).toHaveValue('squash');
  await pick.selectOption('append');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => m.calls.find((c) => c.url === '/api/teams/example')?.body.record.repos).toEqual([{ slug: 'example/app', role: 'work', default: true, commits: 'append' }]);
});

test('Settings, repos at phone width: the table scrolls in its box, and the page does not scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const m = await mock(page);
  m.state.rec.example = { ...m.state.rec.example, repos: [{ slug: 'mozilla-services/syncstorage-rs', role: 'work', commits: 'append' }, { slug: 'mozilla/fxa', role: 'dep' }] };
  await go(page, '#teams/example/settings');
  await main(page).locator('[data-tf="repos"]').click();
  const box = main(page).locator('[data-tform] .tscroll');
  await expect(main(page).getByLabel('Commits of repo 1')).toHaveValue('append');
  expect(await box.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
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




