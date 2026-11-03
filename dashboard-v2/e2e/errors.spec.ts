// The Errors view (design 6.9): one test per parity item, on the polls of the basic fixture with /api/errors from the test.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { open } from './shell.fixture';

// Wider than 1280 px, where the details panel stops being a drawer.
test.use({ viewport: { width: 1440, height: 900 } });

const iso = (ago: number) => new Date(Date.now() - ago * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
const rows = () => [
  { sig: 'a1b2c3d4e5', source: 'ctl', kind: 'boot_failed', status: 'open', message: 'the sample runner did not boot', where: 'session', log: null,
    count: 4, first: '2026-11-01T08:30:00Z', last: iso(300), keys: ['agent-ex0001', 'agent-ex0003', 'agent-zzzz9'], resolved: null },
  { sig: 'b2c3d4e5f6', source: 'bot', kind: 'slack_post', status: 'reopened', message: 'a sample post failed', where: 'bot', log: 'errors/b2c3d4e5f6.log',
    count: 2, first: '2026-11-01T09:00:00Z', last: iso(7200), keys: [], resolved: { at: '2026-11-02T10:00:00Z', note: 'retry the post' } },
  { sig: 'c3d4e5f6a7', source: 'ctl', kind: 'boot_failed', status: 'quiet', message: 'an old boot failure', where: 'session', log: null,
    count: 1, first: '2026-10-01T09:00:00Z', last: iso(8 * 86400), keys: [], resolved: null },
  { sig: 'd4e5f6a7b8', source: 'bot', kind: 'slack_post', status: 'resolved', message: 'a fixed post failure', where: 'bot', log: null,
    count: 1, first: '2026-10-02T09:00:00Z', last: iso(86400), keys: [], resolved: { at: '2026-11-02T11:00:00Z', note: '' } },
];

// The stream says bye off, so the page polls: the sessions from the basic fixture, the errors from body.
async function go(page: Page, hash: string, body: unknown = rows(), status = 200) {
  await page.route('**/api/live*', (r) => r.fulfill({ contentType: 'text/event-stream', body: 'event: bye\ndata: {"reason":"off"}\n\n' }));
  await page.route('**/api/errors*', (r) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }));
  await page.goto(`/v2/${hash}`);
  await expect(page.locator('#conn')).toHaveAttribute('data-mode', 'polling');
}
const main = (page: Page) => page.locator('#s-errors');
const side = (page: Page) => page.locator('#side');
const right = (page: Page) => page.locator('#right');

test('tabs: Open is the default, All lists every row; the selection is in the hash, and Back works', async ({ page }) => {
  await go(page, '#errors');
  await expect(page).toHaveURL(/#errors\/open$/);
  await expect(main(page).locator('h2')).toHaveText('Open errors2');
  await expect(page.getByRole('navigation', { name: 'Errors tabs' }).getByRole('link')).toHaveText(['Open2', 'All4']);
  await side(page).locator('button.si[data-id="b2c3d4e5f6"]').click();
  await expect(page).toHaveURL(/#errors\/open\/b2c3d4e5f6$/);
  await expect(right(page).locator('h2.rh')).toHaveText('Errorb2c3d4e5f6');
  await page.goBack();
  await expect(page).toHaveURL(/#errors\/open$/);
  await expect(right(page).locator('h2.rh')).toHaveText('Errora1b2c3d4e5');
  await page.getByRole('link', { name: /^All/ }).click();
  await expect(main(page).locator('h2')).toHaveText('All errors4');
  await expect(main(page).locator('.err')).toHaveCount(4);
  await page.goto('/v2/#errors/all/d4e5f6a7b8');
  await expect(right(page).locator('h2.rh')).toHaveText('Errord4e5f6a7b8');
});

test('open means open or reopened; quiet counts as fixed; the rail badge counts the open rows', async ({ page }) => {
  await go(page, '#errors/open');
  await expect(main(page).locator('.err')).toHaveCount(2);
  await expect(main(page).locator('.err .m')).toHaveText(['the sample runner did not boot', 'a sample post failed']);
  await expect(page.locator('#n-errors')).toHaveText('2');
  await expect(page.locator('#n-errors')).toHaveClass('n bad');
  await expect(side(page).locator('button.si .dot')).toHaveClass(['dot bad', 'dot bad']);
  await page.goto('/v2/#errors/all');
  await expect(side(page).locator('button.si[data-id="c3d4e5f6a7"] .dot')).toHaveClass('dot ok');
});

test('rows: status tag tones, the message in mono, and the meta with session links to their real tab', async ({ page }) => {
  await go(page, '#errors/all');
  const tags = main(page).locator('.err > span').first();
  await expect(tags).toHaveText('open');
  await expect(tags).toHaveClass(/text-bad bg-badbg/);
  await expect(main(page).locator('#err-c3d4e5f6a7 > span').first()).toHaveClass(/text-dim bg-sunk/);
  expect(await main(page).locator('.err .m').first().evaluate((e) => getComputedStyle(e).fontFamily)).toMatch(/Menlo|mono/i);
  const meta = (sig: string) => main(page).locator(`#err-${sig} .meta`);
  await expect(meta('a1b2c3d4e5')).toHaveText('a1b2c3d4e5 · ctl/boot_failed · session · ×4 · last 5m ago · agent-ex0001 agent-ex0003 agent-zzzz9');
  await expect(meta('b2c3d4e5f6')).toHaveText('b2c3d4e5f6 · bot/slack_post · bot · ×2 · last 2h ago · errors/b2c3d4e5f6.log · last fix 2026-11-02: retry the post');
  await expect(meta('d4e5f6a7b8')).toHaveText('d4e5f6a7b8 · bot/slack_post · bot · ×1 · last 24h ago · resolved 2026-11-02');
  // agent-ex0001 is active in the basic fixture, agent-ex0003 is stopped, and an unknown key opens Stopped.

  expect(await meta('a1b2c3d4e5').getByRole('link').evaluateAll((as) => as.map((a) => a.getAttribute('href')))).toEqual([
    '#sessions/live/agent-ex0001', '#sessions/stopped/agent-ex0003', '#sessions/stopped/agent-zzzz9',
  ]);
});

test('new: a count bar and a recency strip per row, and a heatmap of the open rows by source and kind', async ({ page }) => {
  await go(page, '#errors/all');
  // The meta says the same in words, so the bars are hidden from a screen reader.
  await expect(main(page).locator('#err-a1b2c3d4e5 .err-viz[aria-hidden=true] [aria-label="Seen 4 times"]')).toHaveCount(1);
  await expect(main(page).locator('#err-a1b2c3d4e5 [aria-label="Last seen 5m ago, on a scale from 1 minute to 30 days"]')).toHaveCount(1);
  const left = (sig: string) => main(page).locator(`#err-${sig} .err-rec i`).evaluate((e) => parseFloat((e as HTMLElement).style.left));
  expect(await left('a1b2c3d4e5')).toBeGreaterThan(await left('c3d4e5f6a7'));
  await expect(page.getByRole('img', { name: 'Open errors by source and kind. 2 open in 2 groups. Most: ctl/boot_failed, 1.' })).toBeVisible();
  await main(page).getByText('Show as table').click();
  await expect(main(page).locator('table tbody tr')).toHaveText(['ctlboot_failed1', 'botslack_post1']);
});

test('the footer hint shows the CLI line once, with a Copy button', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await go(page, '#errors/open');
  await expect(main(page).locator('.err-hint')).toHaveCount(1);
  await expect(main(page).locator('.err-hint')).toContainText('Mark one fixed: fxa-sandbox-ctl errors resolve <sig> "<commit or note>". It reopens if it happens again.');
  await main(page).getByRole('button', { name: 'Copy the resolve command' }).click();
  await expect(main(page).locator('.err-hint [role=status]')).toHaveText('Copied.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('fxa-sandbox-ctl errors resolve <sig> "<commit or note>"');
});

test('empty: "No open errors." on Open, "No errors recorded." on All, and "loading…" first', async ({ page }) => {
  let answer: () => void = () => {};
  const gate = new Promise<void>((r) => { answer = r; });
  await page.route('**/api/live*', (r) => r.fulfill({ contentType: 'text/event-stream', body: 'event: bye\ndata: {"reason":"off"}\n\n' }));
  await page.route('**/api/errors*', async (r) => { await gate; await r.fulfill({ contentType: 'application/json', body: '[]' }); });
  await page.goto('/v2/#errors/open');
  await expect(main(page)).toHaveText('Errorsloading…');
  await expect(side(page).locator('.empty')).toHaveText('loading…');
  answer();
  await expect(main(page).locator('.emptybox')).toHaveText('No open errors.');
  await expect(main(page).locator('.err-hint')).toHaveCount(0);
  await expect(side(page).locator('.empty')).toHaveText('Nothing here.');
  await page.getByRole('link', { name: /^All/ }).click();
  await expect(main(page).locator('.emptybox')).toHaveText('No errors recorded.');
  await expect(right(page)).toContainText('Select an item in the list to see its details.');
});

test('a failed read: role=alert, the last good list stays, and never "No open errors"', async ({ page }) => {
  await go(page, '#errors/open', { error: 'errors --json failed' }, 500);
  await expect(main(page).getByRole('alert')).toHaveText('Could not read the errors: errors --json failed. Retrying.');
  await expect(main(page).locator('h2')).toHaveText('Errors');
  await expect(main(page)).not.toContainText('No open errors');
  await expect(page.locator('#n-errors')).toHaveText('?');
});

test('a failed read after a good one keeps the last list and says so', async ({ page }) => {
  await open(page, '#errors/open', {}, (fx) => { fx.store.feeds.errors!.data = rows(); });
  await expect(main(page).locator('.err')).toHaveCount(2);
  const fail = (data?: unknown[]) => page.evaluate((d) => {
    const st = (window as unknown as { __V2_STORE__: { getState: () => { feeds: Record<string, object> }; setState: (x: unknown) => void } }).__V2_STORE__;
    const f = st.getState().feeds;
    st.setState({ feeds: { ...f, errors: { ...f.errors, error: 'errors --json failed', ...(d ? { data: d } : {}) } } });
  }, data);
  await fail();
  await expect(main(page).getByRole('alert')).toHaveText('Could not read the errors: errors --json failed. This is the last list that loaded. Retrying.');
  await expect(main(page).locator('.err')).toHaveCount(2);
  await fail([]);
  await expect(main(page).getByRole('alert')).toHaveText('Could not read the errors: errors --json failed. This is the last list that loaded. Retrying.');
  await expect(main(page)).not.toContainText('No open errors');
});

test('list pane: search over the message and the sig; each item has a dot, the message and the meta', async ({ page }) => {
  await go(page, '#errors/all');
  const items = side(page).locator('button.si');
  await expect(side(page).locator('h2')).toHaveText('Errors 4');
  await expect(items.first()).toHaveText('the sample runner did not boot' + 'open · 4× · ctl/boot_failed · 5m ago');
  await page.locator('#q').fill('post');
  await expect(items).toHaveCount(2);
  await page.locator('#q').fill('c3d4e5f6a7');
  await expect(items).toHaveText(['an old boot failure' + 'quiet · 1× · ctl/boot_failed · 8d ago']);
  await page.locator('#q').fill('');
  await page.getByRole('link', { name: /^Open/ }).click();
  await expect(side(page).locator('button.si').first()).toHaveText('the sample runner did not boot' + '4× · ctl/boot_failed · 5m ago');
});

test('details: every fact, the first row picked, session links, and Mark it fixed with Copy', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await go(page, '#errors/open');
  const r = right(page);
  await expect(r.locator('h2.rh')).toHaveText('Errora1b2c3d4e5');
  await expect(side(page).locator('button.si[aria-current]')).toHaveAttribute('data-id', 'a1b2c3d4e5');
  await expect(r.locator('.err-kv > div')).toHaveText([
    'Statusopen', 'Sourcectl/boot_failed', 'Wheresession', 'Seen4 times', 'First2026-11-01 08:30', /^Last\d{4}-\d\d-\d\d \d\d:\d\d$/,
    'Sessionsagent-ex0001 agent-ex0003 agent-zzzz9',
  ]);
  await expect(r.getByRole('link', { name: 'agent-ex0001' })).toHaveAttribute('href', '#sessions/live/agent-ex0001');
  await expect(r.getByRole('heading', { name: 'Message' })).toBeVisible();
  await expect(r.getByText('the sample runner did not boot')).toBeVisible();
  await r.getByRole('button', { name: 'Copy the resolve command for a1b2c3d4e5' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('fxa-sandbox-ctl errors resolve a1b2c3d4e5 "<commit or note>"');
  await side(page).locator('button.si[data-id="b2c3d4e5f6"]').click();
  await expect(r.locator('.err-kv')).toContainText('Logerrors/b2c3d4e5f6.log');
  await expect(r.locator('.err-kv')).toContainText('Resolved2026-11-02: retry the post');
});

test('details: a row with no times or fields says so, not "NaN" or "undefined"', async ({ page }) => {
  await go(page, '#errors/open', [{ sig: 'e5f6a7b8c9', status: 'open', message: 'a row with no times' }]);
  await expect(right(page).locator('.err-kv > div')).toHaveText(['Statusopen', 'Source?/?', 'Where—', 'Seen—', 'First—', 'Last—']);
  await expect(main(page).locator('.meta')).toHaveText('e5f6a7b8c9 · ?/? · ? · ×? · last unknown');
  await expect(page.locator('body')).not.toContainText(/NaN|undefined/);
});

test('a picked row scrolls into view, with no smooth scroll under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const w = window as unknown as { __scroll: unknown[] }, f = Element.prototype.scrollIntoView;
    w.__scroll = [];
    Element.prototype.scrollIntoView = function (o?: boolean | ScrollIntoViewOptions) { w.__scroll.push([this.id, o]); return f.call(this, o); };
  });
  await go(page, '#errors/all');
  await side(page).locator('button.si[data-id="d4e5f6a7b8"]').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __scroll: unknown[] }).__scroll)).toContainEqual(['err-d4e5f6a7b8', { block: 'center', behavior: 'auto' }]);
  await expect(main(page).locator('#err-d4e5f6a7b8')).toBeInViewport();
});

for (const theme of ['light', 'dark'] as const) {
  test(`axe: no serious or critical issue on Errors in the ${theme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    for (const hash of ['#errors/open', '#errors/all/b2c3d4e5f6']) {
      await go(page, hash);
      await expect(main(page).locator('.err').first()).toBeVisible();
      await main(page).getByText('Show as table').click();
      const { violations } = await new AxeBuilder({ page }).analyze();
      const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${hash} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    }
  });
}

test('at phone width the view has no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await go(page, '#errors/all');
  await expect(main(page).locator('.err')).toHaveCount(4);
  // The heatmap draws at 640 px until its ResizeObserver reads the column width.
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.getElementById('main')!.scrollWidth <= innerWidth)).toBe(true);
});
