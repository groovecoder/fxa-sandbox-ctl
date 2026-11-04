// The shell parity list of the design (section 6.0) again, on the real store: the stream and the reads of the live
// fixtures through serve.py, and the src/model selectors, with no hand-made store.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

type Frame = { id?: string; event: string; data: Record<string, unknown> };
// The parts of a snapshot frame that the tests change.
type Snap = { feeds: { snapshot: { data: { review?: unknown; health: { free_gb: number } } } } };
const frames = (name: string): Frame[] =>
  readFileSync(new URL(`../fixtures/live/${name}.ndjson`, import.meta.url), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Frame);
const sse = (fs: Frame[]) => fs.map((f) => `${f.id ? `id: ${f.id}\n` : ''}event: ${f.event}\ndata: ${JSON.stringify(f.data)}\n\n`).join('');
const BASIC = frames('basic');
const LIVE = /\/api\/live(\?|$)/;
// The fixtures' clock, so an age or a day group reads the same on every run.
const NOW = 1793750400 + 30;

test.use({ viewport: { width: 1440, height: 900 } });
test.beforeEach(({ page }) => page.clock.setFixedTime(NOW * 1000));

const badge = (page: Page, v: string) => page.locator(`#n-${v}`);
const keysOn = (page: Page) => page.addInitScript(() => localStorage.setItem('keys', '1'));
const open = async (page: Page, hash: string) => {
  await page.goto(`/v2/${hash}`);
  await expect(page.locator('#conn')).toHaveAttribute('data-mode', 'live');
};

// The stream answers basic's hello and first snapshot, edited; a reconnect waits for `later`, then gets a hello and its frames.
async function stream(page: Page, edit: (snap: Snap) => void = () => {}, later?: Promise<Frame[]>) {
  const [hello, snap] = structuredClone(BASIC.slice(0, 2)) as [Frame, Frame];
  edit(snap.data as unknown as Snap);
  let n = 0;
  await page.route(LIVE, async (r) => {
    const body = n++ === 0 || !later ? [hello, snap] : [hello, ...(await later)];
    await r.fulfill({ contentType: 'text/event-stream', body: sse(body) });
  });
}
const gate = () => { let open!: (fs: Frame[]) => void; const p = new Promise<Frame[]>((r) => (open = r)); return { p, open }; };

test('rail: 7 links with icon, label and badge; aria-current; an empty badge is hidden', async ({ page }) => {
  await open(page, '#errors');
  const links = page.getByRole('navigation', { name: 'Views' }).getByRole('link');
  await expect(links).toHaveText(['Overview3', 'Pipeline1', 'Sessions2', 'Stats', 'Errors', 'Sandboxes3', 'Teams2']);
  for (const a of await links.all()) await expect(a.locator('svg')).toHaveCount(1);
  await expect(page.getByRole('link', { name: /^Errors/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('a[aria-current]')).toHaveCount(2);
  await expect(badge(page, 'stats')).toBeHidden();
  // The fixture's delta resolved the one open error.
  await expect(badge(page, 'errors')).toBeHidden();
});

test('badges: tones and labels from the model selectors', async ({ page }) => {
  await open(page, '#overview');
  await expect(badge(page, 'overview')).toHaveClass('n warn');
  await expect(badge(page, 'pipeline')).toHaveAttribute('aria-label', '1 PR waits on a review');
  await expect(badge(page, 'pipeline')).toHaveClass('n info');
  await expect(badge(page, 'sessions')).toHaveText('2');
  await expect(badge(page, 'runners')).toHaveAttribute('aria-label', '3 sandboxes need a fix');
  await expect(badge(page, 'runners')).toHaveClass('n warn');
  await expect(badge(page, 'teams')).toHaveClass('n warn');
});

test('badges: an open error is bad; no review list gives "?"; a bad alert makes Overview bad', async ({ page }) => {
  await stream(page, (s) => {
    const h = s.feeds.snapshot.data;
    h.review = null;
    h.health.free_gb = 5;
  });
  await open(page, '#overview');
  await expect(badge(page, 'errors')).toHaveText('1');
  await expect(badge(page, 'errors')).toHaveClass('n bad');
  await expect(badge(page, 'pipeline')).toHaveText('?');
  await expect(badge(page, 'overview')).toHaveClass('n bad');
});

test('theme button cycles system, light, dark and saves localStorage.theme', async ({ page }) => {
  await open(page, '#overview');
  const b = page.locator('#theme');
  await expect(b).toHaveAttribute('title', 'Theme: System. Click for the next one.');
  for (const t of ['light', 'dark']) {
    await b.click();
    expect(await page.evaluate(() => [localStorage.getItem('theme'), document.documentElement.dataset.theme])).toEqual([t, t]);
  }
  await b.click();
  await expect(b).toHaveAccessibleName('Theme: System');
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBeNull();
});

test('header: title, sub, and the panel buttons on the same views as v1', async ({ page }) => {
  await open(page, '#sessions/live');
  await expect(page.locator('#vtitle')).toHaveText('Sessions');
  await expect(page.locator('#vsub')).toHaveText('Slack threads and their sandboxes');
  const btns = async (h: string) => { await page.goto(`/v2/${h}`); return page.locator('#vacts button:visible').evaluateAll((b) => b.map((x) => x.id)); };
  expect(await btns('#overview')).toEqual([]);
  expect(await btns('#stats/spend')).toEqual(['tside']);
  expect(await btns('#errors/open')).toEqual(['tside', 'tright']);
  expect(await btns('#runners/all')).toEqual(['tright']);
  await page.setViewportSize({ width: 800, height: 800 });
  expect(await btns('#teams')).toEqual(['tlist']);
  await expect(page.locator('#tlist')).toHaveAttribute('aria-controls', 'side');
});

test('tabs: counts from the store, aria-current, and focus on a tab survives a live delta', async ({ page }) => {
  const g = gate();
  await stream(page, () => {}, g.p);
  await open(page, '#sessions/live');
  const tabs = page.getByRole('navigation', { name: 'Sessions tabs' }).getByRole('link');
  await expect(tabs).toHaveText(['Live2', 'Paused0', 'Stopped2', /^Answers\d+$/]);
  await expect(tabs.nth(0)).toHaveAttribute('aria-current', 'page');
  const stopped = tabs.nth(2);
  await stopped.focus();
  const row = (BASIC[1]!.data.sessions as Record<string, unknown>[]).find((s) => s.key === 'agent-ex0001')!;
  g.open([{ id: 'e5a17c0d-900', event: 'delta', data: { tbl: 'sessions', rows: [{ ...row, state: 'paused', last_activity: NOW }], deleted: [] } }]);
  await expect(tabs).toHaveText(['Live1', 'Paused1', 'Stopped2', /^Answers\d+$/]);
  await expect(stopped).toBeFocused();
  await page.goto('/v2/#pipeline/queue');
  await expect(page.getByRole('navigation', { name: 'Pipeline tabs' }).getByRole('link')).toHaveText(['Belts5', 'Queue and review1', 'Done0']);
});

test('side list: search filters as you type, groups, aria-current, and the empty texts', async ({ page }) => {
  await keysOn(page);
  await open(page, '#sessions/live/agent-ex0001');
  const side = page.locator('#side');
  await expect(side.locator('h2')).toHaveText('Sessions 2');
  await expect(side.locator('kbd')).toHaveText('/');
  await expect(side.locator('h3.sgroup')).toHaveText('Today');
  await expect(side.locator('button.si[aria-current]')).toHaveAttribute('data-id', 'agent-ex0001');
  await page.locator('#q').fill('faster');
  await expect(side.locator('button.si')).toHaveCount(1);
  await expect(side.locator('button.si')).toHaveAttribute('data-id', 'agent-ex0001');
  await page.locator('#q').fill('zzz');
  await expect(side.locator('.empty')).toHaveText('Nothing matches.');
  await page.goto('/v2/#errors/open');
  await expect(side.locator('.empty')).toHaveText('Nothing here.');
  await page.goto('/v2/#teams');
  await expect(side.locator('h2')).toHaveText('Teams 2');
  await expect(side.locator('button.si[aria-current]')).toHaveAttribute('data-id', '__all');
  await side.locator('button.si[data-id="fxa"]').click();
  await expect(page).toHaveURL(/#teams\/fxa$/);
});

test('side list: "loading…" until the stream brings the list', async ({ page }) => {
  const g = gate();
  await page.route(LIVE, async (r) => r.fulfill({ contentType: 'text/event-stream', body: sse(await g.p) }));
  await page.goto('/v2/#errors/open');
  await expect(page.locator('#side .empty')).toHaveText('loading…');
  g.open(BASIC.slice(0, 2));
  await expect(page.locator('#side button.si')).toHaveCount(1);
});

test('right panel: the details of the shown item, noitem on an empty tab, and the drawer close button', async ({ page }) => {
  await open(page, '#sessions/live');
  await expect(page.locator('#right')).toBeVisible();
  await expect(page.locator('#right')).toContainText('Routine: Nightly review (FxA)');
  await page.goto('/v2/#sessions/paused');
  await expect(page.locator('#right')).toBeHidden();
  await page.goto('/v2/#errors/open');
  await expect(page.locator('#right')).toContainText('Select an item in the list to see its details.');
  await page.setViewportSize({ width: 1100, height: 800 });
  await expect(page.locator('#right')).toBeHidden();
  await page.locator('#tright').click();
  await expect(page.locator('#rclose')).toBeFocused();
  await page.locator('#rclose').click();
  await expect(page.locator('#tright')).toBeFocused();
});

test('panel toggles: noside persists on wide screens; a drawer takes focus and Esc gives it back', async ({ page }) => {
  await open(page, '#errors/all');
  await page.locator('#tside').click();
  await expect(page.locator('#side')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('noside'))).toBe('1');
  await page.reload();
  await expect(page.locator('#side')).toBeHidden();
  await page.setViewportSize({ width: 800, height: 800 });
  await page.locator('#tside').click();
  await expect(page.locator('#q')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#side')).toBeHidden();
  await expect(page.locator('#tside')).toBeFocused();
});

test('pane widths: arrow keys, double-click reset, localStorage.panelW, the limits', async ({ page }) => {
  await open(page, '#errors/all');
  const h = page.getByRole('separator', { name: 'Resize the list' });
  await h.focus();
  await page.keyboard.press('ArrowRight');
  await expect(h).toHaveAttribute('aria-valuenow', '316');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('panelW')!))).toEqual({ '--side': 316 });
  await h.dblclick();
  await expect(h).toHaveAttribute('aria-valuenow', '300');
  for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowLeft');
  await expect(h).toHaveAttribute('aria-valuenow', '220');
});

test('keyboard: off by default; then the view keys, h and l, j and k, / and Esc on the real lists', async ({ page }) => {
  await open(page, '#overview');
  await page.keyboard.press('2');
  await expect(page).toHaveURL(/#overview$/);
  await page.evaluate(() => localStorage.setItem('keys', '1'));
  await page.reload();
  await expect(page.locator('#conn')).toHaveAttribute('data-mode', 'live');
  await page.keyboard.press('3');
  await expect(page).toHaveURL(/#sessions\/live$/);
  await expect(page.locator('.si')).toHaveCount(2);
  await page.keyboard.press('j');
  await expect(page.locator('.si').first()).toBeFocused();
  await page.keyboard.press('j');
  await expect(page.locator('.si').nth(1)).toBeFocused();
  await page.keyboard.press('l');
  await expect(page).toHaveURL(/#sessions\/paused$/);
  await page.keyboard.press('/');
  await expect(page.locator('#q')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#q')).not.toBeFocused();
  await page.goto('/v2/#pipeline/belts/EX-101');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#pipeline\/belts$/);
  await page.goto('/v2/#teams/example');
  await page.keyboard.press('l');
  await expect(page).toHaveURL(/#teams\/example\/routines$/);
});

test('status bar: health dot and word with its title, the cells in order, repo, ages, the stream mode', async ({ page }) => {
  await open(page, '#overview');
  await expect(page.locator('#health')).toHaveText('healthy');
  await expect(page.locator('#health')).toHaveAttribute('title', /lock free · launchcap 3 · 80GB free/);
  await expect(page.locator('#cells > .cell')).toHaveText(['last pass 4m ago', 'queue 1 ready', 'burn $0.00/h']);
  await expect(page.locator('#repo')).toHaveText('example/repo');
  await expect(page.locator('#age')).toHaveText('agents 2s ago, tickets 30s ago');
  await expect(page.getByRole('img', { name: 'Teams feed 100 s old, refreshes every 300 s' })).toBeVisible();
  await expect(page.locator('#conn')).toHaveText('live');
});

test('status bar: Refresh POSTs /api/refresh', async ({ page }) => {
  const posts: string[] = [];
  await page.route('**/api/refresh', (r) => { posts.push(r.request().method()); return r.fulfill({ json: {} }); });
  await open(page, '#overview');
  await page.locator('#refresh').click();
  await expect.poll(() => posts).toEqual(['POST']);
});

test('alerts: the rules in order with tone, fix and expand control; a new alert from the stream is announced', async ({ page }) => {
  const g = gate();
  await stream(page, () => {}, g.p);
  await open(page, '#overview');
  const a = page.locator('#attn .alert');
  await expect(a).toHaveCount(1);
  await expect(a.nth(0)).toHaveClass('alert warn');
  await expect(a.nth(0).locator('.fix')).toHaveText('fxa-sandbox-ctl stop agent-41c0e6');
  await a.nth(0).getByRole('button', { name: 'More about agent-agent-41c0e6' }).click();
  await expect(a.nth(0)).toHaveClass('alert warn open');
  // The alerts of the first read are the start, so the live region says nothing.
  await expect(page.getByRole('status')).toHaveText('');
  const f = (structuredClone(BASIC[1]!.data) as unknown as Snap).feeds.snapshot;
  f.data.health.free_gb = 5;
  g.open([{ id: 'e5a17c0d-901', event: 'feed', data: f }]);
  await expect(page.getByRole('status')).toHaveText('New alert: disk, 5GB free, launches refuse below 20GB');
  await expect(a).toHaveCount(2);
  await expect(a.nth(0)).toHaveClass('alert bad');
});

test('tab title (N) FxA Agent and the favicon', async ({ page }) => {
  await open(page, '#overview');
  await expect(page).toHaveTitle('(3) FxA Agent');
  await expect(page.locator('#favicon')).toHaveAttribute('href', /^data:image\/png/);
});

test('pipeline team picker: All teams, a private team shows counts only', async ({ page }) => {
  await page.context().addCookies([{ name: 'fixture', value: 'private-team', url: 'http://localhost:4174' }]);
  await open(page, '#pipeline/belts');
  const pick = page.getByRole('combobox', { name: 'Pipeline team' });
  await expect(pick.locator('option')).toHaveText(['All teams', /^Example/, /^Example \(private\)$/]);
  await pick.selectOption({ index: 2 });
  await expect(page.locator('.pteam')).toContainText('A private team: details for team admins.');
});

test('command palette: a ticket, a session and Back to v1, from the store', async ({ page }) => {
  await open(page, '#overview');
  await page.keyboard.press('Control+k');
  const box = page.getByRole('combobox', { name: /^Go to/ });
  await box.fill('EX-101');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#pipeline\/belts\/EX-101$/);
  await page.keyboard.press('Control+k');
  await box.fill('agent-ex0001');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#sessions\/live\/agent-ex0001$/);
  await page.keyboard.press('Control+k');
  await box.fill('back to v1');
  await expect(page.locator('dialog.palette').getByRole('option')).toHaveText(['Back to v1Action']);
});

test('help: a modal dialog that takes the focus and gives it back', async ({ page }) => {
  await open(page, '#overview');
  await page.locator('#helpbtn').click();
  await expect(page.locator('#help-close')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#helpbtn')).toBeFocused();
});

test('router: a legacy link is rewritten; #sessions picks the tab of the live sessions', async ({ page }) => {
  await open(page, '#pipeline/board/EX-101');
  await expect(page).toHaveURL(/#pipeline\/belts\/EX-101$/);
  await page.goto('/v2/#sessions');
  await expect(page).toHaveURL(/#sessions\/live$/);
});

test('reduced motion: no element has a running animation on the live store', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, '#overview');
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
});

test('error boundary: a feed row of the wrong shape breaks one section, and the rest renders', async ({ page }) => {
  await stream(page, (s) => { s.feeds.snapshot.data.review = [{ key: { bad: 1 } }]; });
  await open(page, '#pipeline/queue');
  await expect(page.locator('.emptybox[role=alert]')).toContainText('This section did not render:');
  await expect(page.locator('.emptybox[role=alert]')).toContainText('Reload, or run vm.sh rollback.');
  await expect(page.locator('#vtitle')).toHaveText('Pipeline');
  await expect(page.getByRole('navigation', { name: 'Views' }).getByRole('link')).toHaveCount(7);
});
