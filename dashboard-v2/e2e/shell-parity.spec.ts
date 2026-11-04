// The shell parity list of the design (section 6.0), one test per item, on the hand-made store of shell.fixture.ts.
import { expect, test, type Page } from '@playwright/test';
import { open, setStore } from './shell.fixture';

// Wider than 1280 px, where the details panel stops being a drawer.
test.use({ viewport: { width: 1440, height: 900 } });

const badge = (page: Page, v: string) => page.locator(`#n-${v}`);
const keysOn = (page: Page) => page.addInitScript(() => localStorage.setItem('keys', '1'));

test('rail: 7 links with icon, label and badge; aria-current; an empty badge is hidden', async ({ page }) => {
  await open(page, '#errors');
  const links = page.getByRole('navigation', { name: 'Views' }).getByRole('link');
  await expect(links).toHaveText(['Overview!', 'Pipeline2', 'Sessions1', 'Stats', 'Errors1', 'Sandboxes2', 'Teams2']);
  for (const a of await links.all()) await expect(a.locator('svg')).toHaveCount(1);
  await expect(page.getByRole('link', { name: /^Errors/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('a[aria-current]')).toHaveCount(2); // the rail link and the tab
  await expect(badge(page, 'stats')).toBeHidden();
});

test('badges: tones, labels, and the unknown and alert forms', async ({ page }) => {
  await open(page, '#overview');
  await expect(badge(page, 'overview')).toHaveClass('n bad');
  await expect(badge(page, 'pipeline')).toHaveAttribute('aria-label', '2 PRs wait on a review');
  await expect(badge(page, 'pipeline')).toHaveClass('n info');
  await expect(badge(page, 'runners')).toHaveAttribute('aria-label', '2 sandboxes need a fix');
  await expect(badge(page, 'errors')).toHaveClass('n bad');
  await expect(badge(page, 'teams')).toHaveClass('n warn');
});

test('badges: "!" on Overview with an alert, no Needs count there, "?" for unknown reviews and errors', async ({ browser }) => {
  let page = await browser.newPage();
  await open(page, '#overview', { sel: { ovNeeds: { total: 0, sandbox: 0, by: {}, unknown: '' }, alerts: [{ tone: 'warn', subject: 'pass', what: 'x' }] } });
  await expect(badge(page, 'overview')).toHaveText('!');
  await expect(badge(page, 'overview')).toHaveClass('n warn');
  await page.close();
  page = await browser.newPage();
  await open(page, '#overview', { sel: { ovNeeds: { total: 0, sandbox: 0, by: {}, unknown: 'the board read failed' } } }, (fx) => {
    (fx.sel.pipeSnap as Record<string, unknown>).review = null;
    fx.store.feeds.errors!.error = 'errors --json failed';
  });
  // Overview has no Needs you card in v2, so an unknown Needs count is no "?" there.
  await expect(badge(page, 'overview')).not.toHaveText('?');
  await expect(badge(page, 'pipeline')).toHaveText('?');
  await expect(badge(page, 'errors')).toHaveText('?');
  await expect(badge(page, 'errors')).toHaveClass('n warn');
  await page.close();
});

test('theme button cycles system, light, dark and saves localStorage.theme', async ({ page }) => {
  await open(page, '#overview');
  const b = page.locator('#theme');
  await expect(b).toHaveAttribute('title', 'Theme: System. Click for the next one.');
  await b.click();
  await expect(b).toHaveAccessibleName('Theme: Light');
  expect(await page.evaluate(() => [localStorage.getItem('theme'), document.documentElement.dataset.theme])).toEqual(['light', 'light']);
  await b.click();
  await expect(b).toHaveAccessibleName('Theme: Dark');
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await b.click();
  await expect(b).toHaveAccessibleName('Theme: System');
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBeNull();
});

test('header: title, sub, and the panel buttons on the same views as v1', async ({ page }) => {
  await open(page, '#sessions/live');
  await expect(page.locator('#vtitle')).toHaveText('Sessions');
  await expect(page.locator('#vsub')).toHaveText('Slack threads and their sandboxes');
  await expect(page.locator('#tside')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#tside')).toHaveAccessibleName('List');
  await expect(page.locator('#tright')).toHaveAccessibleName('Details');
  const btns = async (h: string) => { await page.goto(`/v2/${h}`); return page.locator('#vacts button:visible').evaluateAll((b) => b.map((x) => x.id)); };
  expect(await btns('#overview')).toEqual([]);
  expect(await btns('#pipeline/belts')).toEqual([]);
  expect(await btns('#sessions/answers')).toEqual([]);
  expect(await btns('#stats/spend')).toEqual(['tside']);
  await expect(page.locator('#tside')).toHaveText('Filters');
  expect(await btns('#errors/open')).toEqual(['tside', 'tright']);
  expect(await btns('#runners/all')).toEqual(['tright']);
  await page.setViewportSize({ width: 800, height: 800 });
  expect(await btns('#teams')).toEqual(['tlist']);
  await expect(page.locator('#tlist')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#tlist')).toHaveAttribute('aria-controls', 'side');
});

test('tabs: links with aria-current and counts; "?" says why; focus on a tab survives an update', async ({ page }) => {
  await open(page, '#pipeline/queue');
  const tabs = page.getByRole('navigation', { name: 'Pipeline tabs' }).getByRole('link');
  await expect(tabs).toHaveText(['Belts5', 'Queue and review2', 'Done1']);
  await expect(tabs.nth(1)).toHaveAttribute('aria-current', 'page');
  await expect(tabs.nth(0)).toHaveAttribute('href', '#pipeline/belts');
  await page.goto('/v2/#sessions/live');
  await expect(page.getByRole('navigation', { name: 'Sessions tabs' }).getByRole('link')).toHaveText(['Live1', 'Paused1', 'Stopped1', 'Answers2']);
  await page.goto('/v2/#errors/all');
  await expect(page.getByRole('navigation', { name: 'Errors tabs' }).getByRole('link')).toHaveText(['Open1', 'All2']);
  await page.goto('/v2/#pipeline/belts');
  const done = page.getByRole('link', { name: /^Done/ });
  await done.focus();
  await page.evaluate(() => {
    const st = (window as unknown as { __V2_STORE__: { getState: () => { feeds: Record<string, { data: Record<string, unknown> }> }; setState: (x: unknown) => void } }).__V2_STORE__;
    const f = st.getState().feeds;
    st.setState({ feeds: { ...f, full: { ...f.full, data: { ...f.full!.data, queue: { fetch_failed: true } } } } });
  });
  await expect(done).toBeFocused();
});

test('tabs: a failed queue read shows "?" with the hidden reason', async ({ page }) => {
  await open(page, '#pipeline/queue', {}, (fx) => { (fx.sel.pipeSnap as Record<string, unknown>).queue = { fetch_failed: true }; });
  await expect(page.getByRole('link', { name: /^Queue and review/ })).toHaveText('Queue and review?, unknown: a feed failed');
});

test('side list: search filters as you type, groups, aria-current, and the empty texts', async ({ page }) => {
  await keysOn(page);
  await open(page, '#sessions/live/agent-aaaa1');
  const side = page.locator('#side');
  await expect(side.locator('h2')).toHaveText('Sessions 2');
  await expect(side.locator('kbd')).toHaveText('/');
  await expect(side.locator('h3.sgroup')).toHaveText('Today');
  await expect(side.locator('button.si[aria-current]')).toHaveAttribute('data-id', 'agent-aaaa1');
  await expect(side.locator('button.si .dot').first()).toHaveClass('dot info live');
  await page.locator('#q').fill('test');
  await expect(side.locator('button.si')).toHaveText(['Write a test$0.40 · user']);
  await page.locator('#q').fill('zzz');
  await expect(side.locator('.empty')).toHaveText('Nothing matches.');
  await page.goto('/v2/#errors/open');
  await expect(side.locator('.empty')).toHaveText('Nothing here.');
  await expect(page.locator('#q')).toHaveValue('');
  await page.goto('/v2/#teams');
  await expect(side.locator('h2')).toHaveText('Teams 2');
  await expect(side.locator('button.si[aria-current]')).toHaveAttribute('data-id', '__all');
  await side.locator('button.si[data-id="fxa"]').click();
  await expect(page).toHaveURL(/#teams\/fxa$/);
  await page.locator('#q').fill('ex');
  await expect(side.locator('button.si')).toHaveCount(1);
});

test('side list: "loading…" before the list loads', async ({ page }) => {
  await open(page, '#errors/open', {}, (fx) => { fx.sel.side.errors = null; });
  await expect(page.locator('#side .empty')).toHaveText('loading…');
});

test('right panel: the empty text, the drawer close button, and noitem on sessions', async ({ page }) => {
  // With a row, Errors picks the first one, so the empty text needs an empty list.
  await open(page, '#errors/open', {}, (fx) => { fx.store.feeds.errors!.data = []; });
  await expect(page.locator('#right')).toContainText('Select an item in the list to see its details.');
  await expect(page.locator('#rclose')).toBeHidden();
  await page.goto('/v2/#sessions/live');
  await expect(page.locator('#right')).toBeHidden();
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto('/v2/#errors/open');
  await expect(page.locator('#right')).toBeHidden();
  await page.locator('#tright').click();
  await expect(page.locator('#rclose')).toBeFocused();
  await page.locator('#rclose').click();
  await expect(page.locator('#right')).toBeHidden();
  await expect(page.locator('#tright')).toBeFocused();
});

test('panel toggles: noside persists on wide screens; a drawer takes focus and Esc gives it back', async ({ page }) => {
  await open(page, '#errors/open');
  await page.locator('#tside').click();
  await expect(page.locator('#side')).toBeHidden();
  await expect(page.locator('#tside')).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => localStorage.getItem('noside'))).toBe('1');
  await page.reload();
  await expect(page.locator('#side')).toBeHidden();
  await page.locator('#tright').click();
  expect(await page.evaluate(() => localStorage.getItem('noright'))).toBe('1');
  await page.setViewportSize({ width: 800, height: 800 });
  await expect(page.locator('#side')).toBeHidden();
  await page.locator('#tside').click();
  await expect(page.locator('#q')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#side')).toBeHidden();
  await expect(page.locator('#tside')).toBeFocused();
});

test('pane widths: drag, arrow keys, double-click reset, localStorage.panelW, the limits', async ({ page }) => {
  await open(page, '#errors/open');
  const h = page.getByRole('separator', { name: 'Resize the list' });
  const width = () => page.locator('#side').evaluate((e) => e.getBoundingClientRect().width);
  await expect(h).toHaveAttribute('aria-valuenow', '300');
  await expect(h).toHaveAttribute('aria-valuemin', '220');
  await expect(h).toHaveAttribute('aria-valuemax', '640');
  const box = (await h.boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 104, box.y + 100);
  await page.mouse.up();
  expect(await width()).toBe(400);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('panelW')!))).toEqual({ '--side': 400 });
  await h.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(h).toHaveAttribute('aria-valuenow', '384');
  await h.dblclick();
  expect(await width()).toBe(300);
  for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowRight');
  await expect(h).toHaveAttribute('aria-valuenow', '640');
  const r = page.getByRole('separator', { name: 'Resize the details' });
  await r.focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
  await expect(r).toHaveAttribute('aria-valuenow', '260');
});

test('keyboard: off by default; the help checkbox turns it on; the single keys', async ({ page }) => {
  await open(page, '#overview');
  await page.keyboard.press('2');
  await expect(page).toHaveURL(/#overview$/);
  await page.locator('#helpbtn').click();
  await page.locator('#keys-on').check();
  expect(await page.evaluate(() => localStorage.getItem('keys'))).toBe('1');
  await page.keyboard.press('Escape');
  await page.keyboard.press('2');
  await expect(page).toHaveURL(/#pipeline\/belts$/);
  await page.keyboard.press('l');
  await expect(page).toHaveURL(/#pipeline\/queue$/);
  await page.keyboard.press('h');
  await expect(page).toHaveURL(/#pipeline\/belts$/);
  await page.keyboard.press('h');
  await expect(page).toHaveURL(/#pipeline\/done$/);
  await page.keyboard.press('Control+3');
  await expect(page).toHaveURL(/#pipeline\/done$/);
  await page.keyboard.press('3');
  await expect(page).toHaveURL(/#sessions\/live$/);
  await page.keyboard.press('j');
  await expect(page.locator('.si').first()).toBeFocused();
  await page.keyboard.press('j');
  await expect(page.locator('.si').nth(1)).toBeFocused();
  await page.keyboard.press('k');
  await expect(page.locator('.si').first()).toHaveClass(/cur/);
  await page.keyboard.press('/');
  await expect(page.locator('#q')).toBeFocused();
  await page.keyboard.type('4');
  await expect(page).toHaveURL(/#sessions\/live$/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#q')).not.toBeFocused();
  await page.keyboard.press('[');
  await expect(page.locator('#side')).toBeHidden();
  await page.keyboard.press('[');
  await page.keyboard.press('?');
  await expect(page.locator('#help')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.goto('/v2/#pipeline/belts/FXA-4');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#pipeline\/belts$/);
  await page.goto('/v2/#teams/example');
  await page.keyboard.press('l');
  await expect(page).toHaveURL(/#teams\/example\/routines$/);
  await page.keyboard.press('h');
  await expect(page).toHaveURL(/#teams\/example$/);
  await page.keyboard.press('h');
  await expect(page).toHaveURL(/#teams\/example\/settings$/);
});

test('status bar: health dot and word with its title, the cells in order, repo, age, conn mode', async ({ page }) => {
  await open(page, '#overview');
  await expect(page.locator('#dot')).toHaveClass('dot warn');
  await expect(page.locator('#health')).toHaveText('degraded');
  await expect(page.locator('#health')).toHaveAttribute('title', 'gce · lock free · launchcap 2 · 80GB free');
  await expect(page.locator('#cells > .cell')).toHaveText(['last pass 4m ago', 'queue 1 ready · 1 skipped', 'burn $2.00/h']);
  await expect(page.locator('#repo')).toHaveText('example/repo');
  await expect(page.locator('#age')).toHaveText('agents 10s ago, tickets 40s ago');
  await expect(page.getByRole('img', { name: 'Tickets feed 40 s old, refreshes every 60 s' })).toBeVisible();
  await expect(page.locator('#conn')).toHaveText('live');
  for (const [mode, word] of [['polling', 'polling every 15 s'], ['connecting', 'reconnecting'], ['offline', 'offline']]) {
    await setStore(page, { conn: { mode, lastEventAt: 1, seq: null } });
    await expect(page.locator('#conn')).toHaveText(word!);
  }
  await expect(page.locator('#health')).toHaveText('unknown');
  await expect(page.locator('.status')).toContainText('Server unreachable');
  await setStore(page, { conn: { mode: 'signin', lastEventAt: 1, seq: null } });
  await expect(page.locator('.status')).toContainText('Your sign-in ended. Reload the page.');
  await expect(page.locator('.status').getByRole('button', { name: 'Reload' })).toBeVisible();
});

test('status bar: Refresh POSTs /api/refresh', async ({ page }) => {
  const posts: string[] = [];
  await page.route('**/api/refresh', (r) => { posts.push(r.request().method()); return r.fulfill({ json: {} }); });
  await open(page, '#overview');
  await page.locator('#refresh').click();
  await expect.poll(() => posts).toEqual(['POST']);
});

test('alerts: every alert in order with its tone, fix, tooltip and expand control; new ones are announced', async ({ page }) => {
  await open(page, '#overview');
  const a = page.locator('#attn .alert');
  await expect(a).toHaveCount(2);
  await expect(a.nth(0)).toHaveClass('alert bad');
  await expect(a.nth(1)).toHaveClass('alert warn');
  await expect(a.nth(0).locator('.fix')).toHaveText('fxa-sandbox-ctl stop slot-1');
  await expect(a.nth(1).locator('.fix')).toHaveCount(0);
  await expect(a.nth(0).locator('.what')).toHaveAttribute('title', /full text in the tooltip$/);
  await a.nth(0).getByRole('button', { name: 'More about tickets' }).click();
  await expect(a.nth(0)).toHaveClass('alert bad open');
  await expect(a.nth(0).getByRole('button', { name: 'Less about tickets' })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#attn')).toHaveAttribute('tabindex', '-1');
  await expect(page.getByRole('status')).toHaveText('');
  await page.evaluate(() => {
    const w = window as unknown as { __V2_FIXTURE__: { sel: { alerts: unknown[] } }; __V2_STORE__: { setState: (f: (s: { prefs: object }) => unknown) => void } };
    w.__V2_FIXTURE__.sel.alerts = [...w.__V2_FIXTURE__.sel.alerts, { tone: 'bad', subject: 'disk', what: '10GB free' }];
    // A new prefs object: the shell repaints only on a store part that it reads.
    w.__V2_STORE__.setState((s) => ({ prefs: { ...s.prefs } }));
  });
  await expect(page.getByRole('status')).toHaveText('New alert: disk, 10GB free');
  await page.goto('/v2/#pipeline/belts');
  await expect(page.locator('#attn')).toHaveCount(0);
});

test('tab title (N) ⚠ FxA Agent, and the favicon has a dot for warn', async ({ page }) => {
  await open(page, '#overview');
  await expect(page).toHaveTitle('(3) ⚠ FxA Agent');
  await expect(page.locator('#favicon')).toHaveAttribute('href', /^data:image\/png/);
  await expect(page.locator('#favicon')).toHaveAttribute('data-level', 'warn');
});

test('error boundary: a section that throws says so, and the rest renders', async ({ page }) => {
  await open(page, '#overview', {}, (fx) => { (fx.sel.health as unknown as { word: unknown }).word = { bad: 1 }; });
  await expect(page.locator('.emptybox[role=alert]')).toContainText('This section did not render:');
  await expect(page.locator('.emptybox[role=alert]')).toContainText('Reload, or run vm.sh rollback.');
  await expect(page.locator('#vtitle')).toHaveText('Overview');
});

test('pipeline team picker: All teams, a private team shows counts only, localStorage.pipeTeam', async ({ page }) => {
  await open(page, '#pipeline/belts');
  const pick = page.getByRole('combobox', { name: 'Pipeline team' });
  await expect(pick.locator('option')).toHaveText(['All teams', 'FxA', 'Example (private)']);
  await expect(page.locator('.pteam')).toContainText('1 teams joined');
  await pick.selectOption('example');
  await expect(page.locator('.pteam')).toContainText('A private team: details for team admins. 1 in review, 2 in flight, 3 ready.');
  expect(await page.evaluate(() => localStorage.getItem('pipeTeam'))).toBe('example');
  await page.reload();
  await expect(pick).toHaveValue('example');
  await page.goto('/v2/#overview');
  await expect(page.locator('.pteam')).toHaveCount(0);
});

test('command palette: Ctrl+K, a ticket, a session, a routine, and Back to v1', async ({ page }) => {
  await open(page, '#overview');
  await page.keyboard.press('Control+k');
  const box = page.getByRole('combobox', { name: /^Go to/ });
  await expect(box).toBeFocused();
  await box.fill('FXA-4');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#pipeline\/belts\/FXA-4$/);
  await page.locator('#find').click();
  await box.fill('agent-bbbb2');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#sessions\/paused\/agent-bbbb2$/);
  await page.keyboard.press('Meta+k');
  await box.fill('nightly');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#teams\/example\/routines\/4$/);
  await page.keyboard.press('Control+k');
  await box.fill('back to v1');
  await expect(page.getByRole('option')).toHaveText(['Back to v1Action']);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.palette')).toBeHidden();
});

test('help: a modal dialog that takes the focus and gives it back', async ({ page }) => {
  await open(page, '#overview');
  await page.locator('#helpbtn').click();
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await expect(page.locator('#help-close')).toBeFocused();
  await expect(page.getByRole('link', { name: 'Back to v1' })).toHaveAttribute('href', '/');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('#help'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#help')).toBeHidden();
  await expect(page.locator('#helpbtn')).toBeFocused();
});

test('router: a legacy link is rewritten with replace, the query keeps its known keys, #sessions picks a tab', async ({ page }) => {
  await open(page, '#pipeline/board/FXA-12');
  await expect(page).toHaveURL(/#pipeline\/belts\/FXA-12$/);
  await page.goto('/v2/#stats/spend?range=7d&evil=1');
  await expect(page).toHaveURL(/#stats\/spend\?range=7d$/);
  await page.goto('/v2/#overview');
  await page.evaluate(() => {
    const st = (window as unknown as { __V2_STORE__: { getState: () => { sessions: { byKey: Record<string, { state: string }> } }; setState: (x: unknown) => void } }).__V2_STORE__;
    const s = st.getState().sessions;
    st.setState({ sessions: { ...s, byKey: { ...s.byKey, 'agent-aaaa1': { ...s.byKey['agent-aaaa1'], state: 'stopped' } } } });
  });
  await page.evaluate(() => { location.hash = '#sessions'; });
  await expect(page).toHaveURL(/#sessions\/paused$/);
});

test('reduced motion: no element has a running animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, '#overview');
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
  await expect(page.locator('#conn')).toHaveText('live');
});
