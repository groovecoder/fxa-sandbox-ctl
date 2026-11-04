// Teams part B: the Routines and Memory tabs, on the v1 page fixtures. Most checks port
// skills/fxa-ctl-dev/page-routine-link.check.sh and page-depfix-routine.check.sh, with the same fixture and the same expected text.
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// The harness is in the dev build only: playwright.config.ts runs this spec in the ds project, on the Vite dev server.
const HARNESS = '/v2/e2e/teams-b.html';
type Fx = Record<string, unknown>;
type Post = { url: string; body: Record<string, unknown> };
type Answer = (p: Post) => { status?: number; body: unknown } | Promise<{ status?: number; body: unknown }>;

// The page.sh rule: "@iso-3600" is an ISO time an hour ago, "@epoch+600" an epoch 10 min ahead.
const now = Date.now() / 1000;
const rel = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(rel);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rel(x)]));
  const m = typeof v === 'string' ? v.match(/^@(iso|epoch)([+-]\d+)$/) : null;
  if (!m) return v;
  const t = now + Number(m[2]);
  return m[1] === 'epoch' ? Math.floor(t) : new Date(t * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
};
const fixture = (name: string): Fx => rel(JSON.parse(readFileSync(new URL(`../../skills/fxa-ctl-dev/page-fixture-${name}.json`, import.meta.url), 'utf8'))) as Fx;

// GETs answer from the fixture, as serve.py --fixture does; each POST is recorded and answered by `post`.
async function open(page: Page, hash: string, fx: Fx, post: Answer = () => ({ body: { ok: true, out: '' } })) {
  const sent: Post[] = [];
  await page.route('**/api/**', async (r) => {
    const u = new URL(r.request().url());
    if (r.request().method() === 'POST') {
      const p = { url: u.pathname, body: JSON.parse(r.request().postData() || '{}') };
      sent.push(p);
      const a = await post(p);
      return r.fulfill({ status: a.status ?? 200, json: a.body });
    }
    const miss = /routines|errors/.test(u.pathname) ? [] : {};
    return r.fulfill({ json: u.pathname in fx ? fx[u.pathname] : miss });
  });
  await page.goto(`${HARNESS}${hash}`);
  return sent;
}
const norm = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
const text = async (page: Page, sel: string) => norm(await page.locator(sel).first().innerText());

test.describe('routines: links, list and create (page-fixture-routines)', () => {
  const F = fixture('routines');
  test('a link with routine 1 opens the page of Alpha; with no routine the list opens', async ({ page }) => {
    await open(page, '#teams/example/routines/1', F);
    await expect(page.locator('.rtd .nm')).toContainText('Alpha');
    await page.evaluate(() => { location.hash = '#teams/example/routines'; });
    await expect(page.locator('[data-routine-list]')).toBeVisible();
  });
  test('a link to a routine that is gone says so above the list', async ({ page }) => {
    await open(page, '#teams/example/routines/999', F);
    await expect(page.locator('[data-routine-list]')).toContainText('The routine from the link is no longer here.');
  });
  test('a card opens its routine, and Routines goes back to the list', async ({ page }) => {
    await open(page, '#teams/example/routines', F);
    await page.locator('[data-rt-sel="2"]').click();
    await expect(page.locator('.rtd .nm')).toContainText('Beta');
    await page.locator('[data-rt-list]').click();
    await expect(page.locator('[data-routine-list]')).toBeVisible();
  });
  test('the head counts against the limit, and a stale scheduler is an alert and a Stopped tile', async ({ page }) => {
    await open(page, '#teams/example/routines', F);
    await expect(page.locator('.rt-head .n')).toHaveText('2 of 8 allowed');
    await expect(page.locator('[data-routine-list]')).toContainText('The scheduler has not run yet. Routines are not running.');
    await expect(page.locator('.rtkpis > *').nth(3)).toContainText('Stopped');
  });
  test('the filter counts and its empty text', async ({ page }) => {
    await open(page, '#teams/example/routines', F);
    await expect(page.getByRole('group', { name: 'Show' }).getByRole('button')).toHaveText(['All 2', 'Needs attention 0', 'Paused 0']);
    await page.locator('[data-rt-show="paused"]').click();
    await expect(page.locator('[data-rt-show="paused"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-routine-list]')).toContainText('No routine is paused.');
  });
  test('New routine is off at the limit', async ({ page }) => {
    const list = F['/api/teams/example/routines'] as Fx[];
    await open(page, '#teams/example/routines', { ...F, '/api/teams/example/routines': Array.from({ length: 8 }, (_, i) => ({ ...list[0], id: i + 1 })) });
    await expect(page.locator('[data-rt-new]')).toBeDisabled();
    await expect(page.locator('[data-rt-new]')).toHaveAttribute('title', 'A team has at most 8 routines');
  });
  for (const then of [false, true]) {
    test(`${then ? 'Create and run now posts the routine, then its run' : 'Create posts the draft the start and the buttons made'}`, async ({ page }) => {
      const sent = await open(page, '#teams/example/routines', F, () => ({ body: { out: 'created routine 7' } }));
      await page.locator('[data-rt-new]').click();
      await expect(page.locator('#rt-form-h')).toBeFocused();
      await page.locator('[data-rt-tpl="code-review"]').click();
      await expect(page.locator('#rt-form-h')).toBeFocused();
      await page.locator('[data-rt-kind="weekly"]').click();
      await page.locator('[data-rt-day="fri"]').click();
      await page.locator('#rt-name').fill('Friday review');
      await expect(page.locator('[data-rt-readback]')).toHaveText(/^Friday review runs every Friday at 09:00 /);
      await page.locator(then ? '[data-rt-then="run"]' : '[data-rt-save]:not([data-rt-then])').click();
      await expect.poll(() => sent.length).toBe(then ? 2 : 1);
      const r = sent[0]!.body.routine as Fx;
      expect([sent[0]!.url, r.template, r.schedule, r.repos]).toEqual(['/api/teams/example/routines', 'code-review', 'weekly fri 09:00', ['example/app']]);
      if (then) expect(sent[1]!.url).toBe('/api/teams/example/routines/7/run');
    });
  }
  test('a second click on Create while the first is on its way creates no second routine', async ({ page }) => {
    const sent = await open(page, '#teams/example/routines', F, async () => { await new Promise((r) => setTimeout(r, 400)); return { body: { out: 'created routine 7' } }; });
    await page.locator('[data-rt-new]').click();
    await page.locator('[data-rt-tpl="blank"]').click();
    await page.locator('#rt-name').fill('Mine');
    await page.locator('#rt-prompt').fill('Do it.');
    await page.locator('[data-rt-save]:not([data-rt-then])').evaluate((b: HTMLButtonElement) => { b.click(); b.click(); });
    await expect(page.locator('[data-rt-msg]')).toHaveText('created routine 7');
    expect(sent.length).toBe(1);
  });
  test('the validator errors go to their fields, and the focus goes to the first one', async ({ page }) => {
    await open(page, '#teams/example/routines', F, () => ({ status: 400, body: { error: 'ERROR: name: Name is empty\nmax_usd: The limit must be 1 to 50' } }));
    await page.locator('[data-rt-new]').click();
    await page.locator('[data-rt-tpl="blank"]').click();
    await page.locator('[data-rt-save]:not([data-rt-then])').click();
    await expect(page.locator('#rt-name')).toBeFocused();
    await expect(page.locator('#rt-name')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#rt-name')).toHaveAccessibleDescription('Name is empty');
    await expect(page.locator('#rt-max_usd')).toHaveAccessibleDescription('The limit must be 1 to 50');
    await expect(page.locator('[data-rt-msg]')).toHaveText('2 fields need a change: Name is empty. The limit must be 1 to 50.');
  });
  test('a 409 keeps the draft and takes the new version, so Save again replaces their change', async ({ page }) => {
    let n = 0;
    const sent = await open(page, '#teams/example/routines/1', F, () => (n++ ? { body: { out: 'saved routine 1' } } : { status: 409, body: { error: 'the routine changed' } }));
    await page.locator('[data-rt-act="edit"][data-rt-id="1"]').first().click();
    await page.locator('#rt-name').fill('Alpha two');
    await page.locator('[data-rt-save]').click();
    await expect(page.locator('[data-rt-msg]')).toContainText('Someone changed this routine since you opened it. Save again');
    await expect(page.locator('#rt-name')).toHaveValue('Alpha two');
    await page.locator('[data-rt-save]').click();
    await expect.poll(() => sent.length).toBe(2);
    expect(sent.map((s) => [s.url, (s.body.routine as Fx).name, s.body.version])).toEqual([['/api/teams/example/routines/1', 'Alpha two', 1], ['/api/teams/example/routines/1', 'Alpha two', 1]]);
  });
  test('a non-admin sees why, and no routine', async ({ page }) => {
    await open(page, '#teams/example/routines', { ...F, '/api/team-admin': { admin: false, teams: [] } });
    await expect(page.getByText('Only a team admin can see and change routines.')).toBeVisible();
    await expect(page.locator('[data-routines]')).toHaveCount(0);
  });
  test('a team record admin passes the routines gate', async ({ page }) => {
    await open(page, '#teams/example/routines', { ...F, '/api/team-admin': { admin: false, teams: ['example'] } });
    await expect(page.locator('[data-routine-list]')).toBeVisible();
  });
});

test.describe('routines: a dependency PR routine (page-fixture-depfix-routine)', () => {
  const F = fixture('depfix-routine');
  test('the card says what it does, and its next run is on request', async ({ page }) => {
    await open(page, '#teams/example/routines', F);
    await expect(page.locator('[data-rt-row="1"] .says')).toHaveText('When a dependency PR in example/app asks for help, pushes one fix commit, and posts in #deps.');
    const next = page.locator('[data-rt-row="1"] .fact').filter({ hasText: 'Next run' });
    await expect(next).toHaveText(/on request$/);
    expect(await text(page, '[data-routine-list]')).not.toMatch(/undefined/);
    expect(await text(page, '[data-rt-row="1"]')).not.toMatch(/within 60 min/);
  });
  test('the legend names the fix results too', async ({ page }) => {
    await open(page, '#teams/example/routines', F);
    const k = await text(page, '.rtkey');
    for (const w of ['Pushed', 'Not pushed', 'No fix found', 'Not started']) expect(k).toContain(w);
  });
  test('the page shows the repo, authors and label, and its next run is on request', async ({ page }) => {
    await open(page, '#teams/example/routines/1', F);
    const setup = page.locator('.rtd').getByRole('heading', { name: /^Setup/ }).locator('..');
    for (const l of ['Repo', 'Authors', 'Label']) await expect(setup.getByText(l, { exact: true })).toBeVisible();
    for (const l of ['Schedule', 'Time zone', 'No new commits']) await expect(setup.getByText(l, { exact: true })).toHaveCount(0);
    await expect(page.locator('.rtkpis > *').nth(3)).toContainText('Next runon request');
    expect(await text(page, '.rtd')).not.toMatch(/undefined/);
  });
  test('the page lists every live run: the running PR, one in line and one that waits on a gate', async ({ page }) => {
    await open(page, '#teams/example/routines/1', F);
    const lives = async () => (await page.locator('.rtd [data-rt-live]').allInnerTexts()).map((t) => norm(t).replace(/ agent-\S+| Stop run/g, ''));
    await expect.poll(lives).toEqual(['#90001 Running', '#90002 In line behind #90001', '#90003 Waiting: the team budget is used']);
  });
  test('each fix run shows its result, trigger, PR, SHAs and next step', async ({ page }) => {
    await open(page, '#teams/example/routines/1', F);
    await expect(page.locator('.rtd .item')).toHaveCount(7);
    const rows = await page.locator('.rtd .item').evaluateAll((es) => es.map((e) => [e.querySelector('.title')?.textContent, e.querySelector('.line1 > :last-child')?.textContent,
      e.querySelector('.line2')?.textContent?.replace(/\s+/g, ' ').trim().replace(/ · \d\d:\d\d/, ''), e.querySelector('.next')?.textContent ?? ''].join(' / ')));
    expect(rows).toEqual([
      'Pushed bbbbbbb to #90001 / Pushed / label by example-writer · $1.20 · agent-fix021 · #90001 · aaaaaaa → bbbbbbb / Next: review the fix commit, then approve the functional tests gate.',
      'No fix found for #90004 / No fix found / BLEnder · $0.80 · #90004 · ccccccc / A new commit allows a new run.',
      'The branch of #90005 moved, so nothing was pushed / Branch moved / Run now by admin · $0.90 · #90005 · ddddddd / Add agent-help again to retry.',
      'Not pushed (yarn.lock) / Not pushed / label by example-writer · $0.70 · #90006 · eeeeeee / The fix changes yarn.lock entries, which I do not push. Fix it by hand.',
      'Stopped (the agent-help label was removed) / Stopped / label by example-writer · $0.20 · #90007 · fffffff / Nothing was pushed. Add agent-help again to retry.',
      'Not started (the PR has a new commit) / Not started / label by example-writer · no cost · #90008 · 0000000 / Add agent-help again to fix the new head.',
      'The sandbox did not start / Failed / label by example-writer · no cost · #90009 · 9999999 / Nothing was pushed. Add agent-help again to retry.',
    ]);
  });
  test('the runs update on a new history read, and an open report stays open', async ({ page }) => {
    const F2 = structuredClone(F);
    (F2['/api/teams/example/routines/1/history'] as Fx[])[0]!.report = 'The fix report.';
    await open(page, '#teams/example/routines/1', F2);
    const rep = page.locator('[data-rt-run="21"]');
    await rep.locator('summary').click();
    await expect(rep).toHaveAttribute('open', '');
    const runs = F2['/api/teams/example/routines/1/history'] as Fx[];
    await page.evaluate((r) => (window as unknown as { __dispatch: (a: unknown) => void }).__dispatch({ event: 'routine-hist', data: { id: '1', runs: r } }),
      [{ id: 22, trigger: 'label', actor: 'example-writer', state: 'ok', started_at: now - 60, heads: { fix: { pr: 90011, new_sha: 'abcdef1234567' } } }, ...runs]);
    await expect(page.locator('.rtd .item')).toHaveCount(8);
    await expect(page.locator('.rtd .item .title').first()).toHaveText('Pushed abcdef1 to #90011');
    await expect(rep).toHaveAttribute('open', '');
  });
  test('the form for a dependency PR start: no schedule, no prompt, no Create and run now; it reads back and sends on and pr', async ({ page }) => {
    const sent = await open(page, '#teams/example/routines', F, () => ({ body: { out: 'created routine 7' } }));
    await page.locator('[data-rt-new]').click();
    await page.locator('[data-rt-tpl="depfix"]').click();
    await page.locator('#rt-pr_authors').fill('dependabot[bot], example-blender[bot]');
    await page.locator('#rt-channel').selectOption('C0123ABCD');
    expect(await text(page, '[data-routine-form]')).toMatch(/When: a dependency PR asks for help/);
    await expect(page.locator('[data-rt-then="run"]')).toHaveCount(0);
    await expect(page.locator('#rt-schedule, #rt-time, #rt-prompt')).toHaveCount(0);
    await expect(page.locator('#rt-channel + p, [data-routine-form]').first()).toContainText('✓ @fxa-agent is in this channel');
    expect(await text(page, '[data-rt-readback]')).toBe('Dependency fixes runs when a dependency PR in example/app by dependabot[bot] or example-blender[bot] asks for help with the agent-help label. It pushes one fix commit to the PR branch, posts in #deps, and stops at $10.00 a run.');
    await page.locator('[data-rt-save]').click();
    await expect.poll(() => sent.length).toBe(1);
    const r = sent[0]!.body.routine as Fx;
    expect([r.on, r.mode, r.repos, r.pr, 'schedule' in r, 'prompt' in r, 'zone' in r])
      .toEqual(['pr-label', 'pr', ['example/app'], { repo: 'example/app', authors: ['dependabot[bot]', 'example-blender[bot]'], label: 'agent-help' }, false, false, false]);
  });
  test('the pr errors go to their own fields', async ({ page }) => {
    await open(page, '#teams/example/routines', F, () => ({ status: 400, body: { error: 'ERROR: pr: authors must be 1 to 10 GitHub logins, such as dependabot[bot]' } }));
    await page.locator('[data-rt-new]').click();
    await page.locator('[data-rt-tpl="depfix"]').click();
    await page.locator('#rt-pr_authors').fill('');
    await page.locator('[data-rt-save]').click();
    await expect(page.locator('#rt-pr_authors')).toBeFocused();
    await expect(page.locator('#rt-pr_authors')).toHaveAccessibleDescription('authors must be 1 to 10 GitHub logins, such as dependabot[bot]');
  });
  test('Edit of a pr-label routine fills the pr fields, and keeps the hidden pr keys on save', async ({ page }) => {
    const sent = await open(page, '#teams/example/routines/1', F);
    await page.locator('[data-rt-act="edit"][data-rt-id="1"]').first().click();
    await expect(page.locator('#rt-pr_repo')).toHaveValue('example/app');
    await expect(page.locator('#rt-pr_authors')).toHaveValue('dependabot[bot], example-blender[bot]');
    await expect(page.locator('#rt-pr_label')).toHaveValue('agent-help');
    await expect(page.locator('[data-rt-then="run"]')).toHaveCount(0);
    await page.locator('[data-rt-save]').click();
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0]!.body).toMatchObject({ version: 3, routine: { pr: { blender_login: 'example-blender[bot]', sweep_min: 5 } } });
  });
  test('Run now asks for a PR URL, shows Checking the PR, ties the refusal to the field, then says Queued', async ({ page }) => {
    let n = 0;
    const sent = await open(page, '#teams/example/routines/1', F, async () => {
      await new Promise((r) => setTimeout(r, 300));
      return n++ ? { body: { ok: true, out: 'queued run 31: Queued for #90010. The PR comment shows its state.' } }
        : { status: 400, body: { error: 'ERROR: A run on 1111111 already ended. A new commit allows a new run.' } };
    });
    await page.locator('.rtd [data-rt-act="run"][data-rt-id="1"]').first().click();
    const ask = page.locator('[data-rt-ask]');
    await expect(page.getByLabel('PR URL')).toBeVisible();
    await expect(ask).toBeFocused();
    await ask.fill('https://github.com/example/app/pull/90001');
    await page.locator('[data-rt-act="runpr"]').click();
    await expect(page.locator('[data-rt-act="runpr"]')).toHaveText('Checking the PR…');
    await expect(page.locator('[data-rt-act="runpr"]')).toBeDisabled();
    await expect(ask).toHaveAccessibleDescription('A run on 1111111 already ended. A new commit allows a new run.');
    await expect(ask).toHaveAttribute('aria-invalid', 'true');
    await ask.fill('https://github.com/example/app/pull/90010');
    await ask.press('Enter');
    await expect(page.locator('[data-rt-msg]')).toHaveText('Queued for #90010. The PR comment shows its state.');
    await expect(ask).toHaveCount(0);
    expect(sent.map((s) => `${s.url} ${JSON.stringify(s.body)}`)).toEqual([
      '/api/teams/example/routines/1/run {"pr":"https://github.com/example/app/pull/90001"}',
      '/api/teams/example/routines/1/run {"pr":"https://github.com/example/app/pull/90010"}',
    ]);
  });
  test("a card's Run now on a pr-label routine with live runs is on, and opens the field", async ({ page }) => {
    await open(page, '#teams/example/routines', F);
    const b = page.locator('[data-rt-act="run"][data-rt-id="1"]');
    await expect(b).toBeEnabled();
    await b.click();
    await expect(page.locator('[data-rt-row="1"] [data-rt-ask]')).toBeVisible();
  });
  test('each live run has its own Stop run, and a press sends that run id', async ({ page }) => {
    const sent = await open(page, '#teams/example/routines/1', F, () => ({ body: { ok: true, out: 'stopped run 12' } }));
    await expect(page.locator('.rtd [data-rt-live] [data-rt-act="stop"]')).toHaveCount(3);
    const b = page.locator('[data-rt-live="12"] [data-rt-act="stop"]');
    // v1 said "Stop the run for #n", a name that does not hold the visible "Stop run" (axe label-content-name-mismatch).
    await expect(b).toHaveAttribute('aria-label', 'Stop run for #90002');
    await b.click();
    await expect.poll(() => sent.map((s) => `${s.url} ${JSON.stringify(s.body)}`)).toEqual(['/api/teams/example/routines/1/stop {"run":12}']);
  });
  test('Delete takes two clicks', async ({ page }) => {
    const sent = await open(page, '#teams/example/routines/2', F, () => ({ body: { ok: true, out: 'deleted routine 2' } }));
    await page.locator('[data-rt-act="delete"]').click();
    await expect(page.locator('[data-rt-msg]')).toHaveText('Delete Weekday review? Click Delete again. You cannot undo this.');
    expect(sent).toEqual([]);
    await page.locator('[data-rt-act="delete"]').click();
    await expect.poll(() => sent.map((s) => s.url)).toEqual(['/api/teams/example/routines/2/delete']);
    await expect(page).toHaveURL(/#teams\/example\/routines$/);
  });
  test('Pause posts pause, and the message takes the focus when the button turns off', async ({ page }) => {
    const sent = await open(page, '#teams/example/routines', F, () => ({ body: { ok: true, out: 'paused routine 2' } }));
    const sw = page.getByRole('switch', { name: 'Routine Weekday review' });
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    await sw.click();
    await expect(page.locator('[data-rt-msg]')).toHaveText('paused routine 2');
    expect(sent.map((s) => s.url)).toEqual(['/api/teams/example/routines/2/pause']);
  });
});

const MEM = {
  on: true, dep: ['example/lib'],
  entries: [
    { id: 'mem-0000aaaa', v: 'aaaaaaaaaaaa', scope: 'team', kind: 'trap', text: 'Run the auth tests with the stack up.', why: 'They time out.', path: '', terms: '', confirmed: '2026-10-30', cites: [{ cite: 'example/app:test/auth.js:4', anchor: 'beforeAll' }] },
    { id: 'mem-0000bbbb', v: 'bbbbbbbbbbbb', scope: 'example/app', kind: 'command', text: 'Use yarn workspace to run one package.', why: '', path: '', terms: '', confirmed: '2025-01-02', person: true, cites: [{ cite: 'example/app:package.json:2', anchor: 'workspaces' }] },
    { id: 'mem-0000cccc', v: 'cccccccccccc', scope: 'example/lib', kind: 'convention', text: 'The lib exports ESM only.', why: '', path: '', terms: '', confirmed: '2026-10-01', dep: true, cites: [{ cite: 'example/lib:package.json:3', anchor: 'type' }] },
  ],
};
test.describe('memory', () => {
  const F = { ...fixture('routines'), '/api/teams/example/memory': MEM };
  test('a non-admin, and a team record admin, see the real rule', async ({ page }) => {
    await open(page, '#teams/example/memory', { ...F, '/api/team-admin': { admin: false, teams: ['example'] } });
    await expect(page.getByText('Only a dashboard admin (TEAM_ADMINS) can see and change team memory. A team record admin cannot.')).toBeVisible();
  });
  test('memory that is off on the host says so', async ({ page }) => {
    await open(page, '#teams/example/memory', { ...F, '/api/teams/example/memory': { on: false } });
    await expect(page.getByText('Team memory is off on this host.')).toBeVisible();
  });
  test('the count, the table with its tags, and the dependency repo facts', async ({ page }) => {
    await open(page, '#teams/example/memory', F);
    await expect(page.locator('[data-memory]')).toContainText('2 facts for this team and its repos, from main.');
    await expect(page.locator('tr[data-mem]:visible')).toHaveCount(2);
    await expect(page.locator('tr[data-mem="mem-0000bbbb"]')).toContainText('person');
    await expect(page.locator('tr[data-mem="mem-0000bbbb"]')).toContainText('not in index');
    await expect(page.locator('[data-mem-dep]')).not.toHaveAttribute('open', '');
    await expect(page.locator('tr[data-mem="mem-0000cccc"] [data-mem-edit]')).toHaveCount(0);
  });
  test('the filter keeps an open form and opens the dependency repo facts', async ({ page }) => {
    await open(page, '#teams/example/memory', F);
    await page.locator('[data-mem-new]').click();
    await expect(page.locator('#mem-form-h')).toBeFocused();
    await page.locator('#mem-text').fill('A draft fact');
    await page.locator('[data-mem-q]').fill('esm');
    await expect(page.locator('#mem-text')).toHaveValue('A draft fact');
    await expect(page.locator('[data-mem-dep]')).toHaveAttribute('open', '');
    await expect(page.locator('[data-memory]')).toContainText('No fact matches the filter.');
  });
  test('a repo scope takes one cite and no system kind', async ({ page }) => {
    await open(page, '#teams/example/memory', F);
    await page.locator('[data-mem-new]').click();
    await page.locator('[data-mem-addcite]').click();
    await expect(page.locator('[data-mem-cite][data-part="cite"]')).toHaveCount(2);
    await page.locator('#mem-scope').selectOption('example/app');
    await expect(page.locator('[data-mem-cite][data-part="cite"]')).toHaveCount(1);
    await expect(page.locator('#mem-kind')).toHaveValue('trap');
    await expect(page.locator('#mem-kind option[value="system"]')).toHaveCount(0);
  });
  test('Save posts the entry; the errors go to their fields; a 409 takes the new version', async ({ page }) => {
    let n = 0;
    const sent = await open(page, '#teams/example/memory', F, () => (n++ === 0
      ? { status: 400, body: { error: 'ERROR: text: The fact is empty\ncite1: no such file' } }
      : n === 2 ? { status: 409, body: { error: 'the entry changed' } } : { body: { out: 'saved mem-0000aaaa\nWARN: push failed' } }));
    await page.locator('[data-mem-edit="mem-0000aaaa"]').click();
    await page.locator('#mem-text').fill('');
    await page.locator('[data-mem-save]').click();
    await expect(page.locator('#mem-text')).toBeFocused();
    await expect(page.locator('#mem-text')).toHaveAccessibleDescription('The fact is empty');
    await expect(page.locator('#mem-cite1')).toHaveAccessibleDescription('no such file');
    await expect(page.getByRole('alert')).toHaveText('Fix the marked fields.');
    await page.locator('#mem-text').fill('Run the auth tests with the stack up, always.');
    await page.locator('[data-mem-save]').click();
    await expect(page.getByRole('alert')).toHaveText('the entry changed');
    await page.locator('[data-mem-save]').click();
    await expect(page.locator('[data-mem-msg]')).toHaveText('Saved mem-0000aaaa. The push to GitHub failed; the next save pushes it.');
    expect(sent.map((s) => [s.url, s.body.v])).toEqual([['/api/teams/example/memory/mem-0000aaaa', 'aaaaaaaaaaaa'], ['/api/teams/example/memory/mem-0000aaaa', 'aaaaaaaaaaaa'], ['/api/teams/example/memory/mem-0000aaaa', 'aaaaaaaaaaaa']]);
  });
  test('Delete takes two clicks', async ({ page }) => {
    const sent = await open(page, '#teams/example/memory', F, () => ({ body: { out: 'deleted' } }));
    const b = page.locator('[data-mem-del="mem-0000aaaa"]');
    await b.click();
    await expect(b).toHaveText('Delete it?');
    expect(sent).toEqual([]);
    await b.click();
    await expect(page.locator('[data-mem-msg]')).toHaveText('Deleted mem-0000aaaa.');
    expect(sent.map((s) => [s.url, s.body])).toEqual([['/api/teams/example/memory/mem-0000aaaa/delete', { v: 'aaaaaaaaaaaa', scope: 'team' }]]);
  });
});

// Each route in both themes, with the forms open and every chart table open.
const A11Y: [string, string, Fx, string?][] = [
  ['routines list', '#teams/example/routines', fixture('depfix-routine')],
  ['list with a paused routine', '#teams/example/routines', { ...fixture('routines'), '/api/teams/example/routines': (fixture('routines')['/api/teams/example/routines'] as Fx[]).map((r) => ({ ...r, paused: 1 })) }],
  ['routine page', '#teams/example/routines/1', fixture('depfix-routine')],
  ['routine form', '#teams/example/routines', fixture('depfix-routine'), 'code-review'],
  ['dependency fix form', '#teams/example/routines', fixture('depfix-routine'), 'depfix'],
  ['empty list', '#teams/example/routines', { ...fixture('routines'), '/api/teams/example/routines': [] }],
  ['memory', '#teams/example/memory', { ...fixture('routines'), '/api/teams/example/memory': MEM }, 'mem'],
];
for (const theme of ['light', 'dark'] as const) {
  for (const [name, hash, fx, form] of A11Y) {
    test(`${name} has no serious or critical axe issue in the ${theme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await open(page, hash, fx);
      await expect(page.locator('[data-routines], [data-memory]').first()).toBeVisible();
      if (form === 'mem') await page.locator('[data-mem-new]').click();
      else if (form) { await page.locator('[data-rt-new]').click(); await page.locator(`[data-rt-tpl="${form}"]`).click(); }
      for (const s of await page.getByText('Show as table').all()) await s.click();
      expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
      const { violations } = await new AxeBuilder({ page }).analyze();
      const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }
}
