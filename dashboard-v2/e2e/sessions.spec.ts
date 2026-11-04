// The Sessions parity list (design 6.5), on the real store. A fake EventSource lets each test send the frames, so a delta comes when the test says.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 900 } });

type Row = Record<string, unknown>;
const NOW = Math.floor(Date.now() / 1000);
const iso = (ago: number) => new Date((NOW - ago) * 1000).toISOString();
const LONG = 'A long reply line.\n'.repeat(40);

const SESSIONS: Row[] = [
  { key: 'agent-live01', state: 'active', agent_alive: true, turns: 3, created: NOW - 1200, booted_at: NOW - 1100, boot_s: 100, owner: 'U1', owner_name: 'Sample Person',
    request: 'make the sample page faster', profile: 'fxa', slack_url: 'https://example.slack.com/archives/C1/p1700000000000100', agent: { cost_so_far: 0.5 },
    media: [{ name: 'shot.png', at: NOW - 600 }, { name: 'clip.mp4', at: NOW - 590 }] },
  { key: 'agent-live02', state: 'active', agent_alive: false, turn_open: '0', last_activity: NOW - 300, turns: 1, created: NOW - 900, booted_at: NOW - 850,
    owner: 'U2', owner_name: 'Other Person', request: 'check the other sample', profile: 'fxa' },
  { key: 'agent-fix001', state: 'active', agent_alive: true, turns: 1, created: NOW - 800, owner: 'U-ROUTINE', routine_run: 21, routine_name: 'Dependency fixes',
    fix_pr: 90001, fix_trigger: 'label', fix_actor: 'octo-example', request: 'fix the failing checks of PR 90001', profile: 'example' },
  { key: 'agent-old001', state: 'stopped', turns: 2, created: NOW - 90000, stopped_at: NOW - 89000, owner: 'U1', owner_name: 'Sample Person',
    request: 'first ask in the chain', profile: 'fxa', summary: '{"cost": 0.2}', runner_s: 1000, busy_s: 600, idle_s: 400 },
  { key: 'agent-new001', state: 'paused', resume_from: 'agent-old001', turns: 1, created: NOW - 3000, owner: 'U1', owner_name: 'Sample Person',
    request: 'a follow-up', profile: 'fxa', pr_url: 'https://github.com/example/repo/pull/12', finish_notes: 'Notes. '.repeat(120) },
  { key: 'agent-fail01', state: 'stopped', stop_reason: 'boot failed', created: NOW - 200000, owner: 'U2', owner_name: 'Other Person', request: 'a boot that failed', profile: 'fxa' },
];
const HIST: Record<string, Row[]> = {
  'agent-live01': [
    { key: 'agent-live01', role: 'person', at: NOW - 1200, text: 'make the sample page faster', name: 'Sample Person', image: '/icon.png' },
    { key: 'agent-live01', role: 'agent', at: NOW - 1100, text: '## Plan\n\nI will *read* the page.\n\n- one\n- two\n\n```\ncode here\n```\n[a link](https://example.com/x) [bad](javascript:alert(1)) <script>x</script>' },
    { key: 'agent-live01', role: 'action', at: NOW - 1000, text: 'Opened a draft' },
    { key: 'agent-live01', role: 'agent', at: NOW - 500, text: LONG },
    { key: 'agent-live01', role: 'agent', at: NOW - 500, text: LONG },
    { key: 'agent-live01', role: 'person', at: NOW - 450, text: 'A reply from a person with no picture.', name: 'Other Person' },
    { key: 'agent-live01', role: 'agent', at: NOW - 400, text: 'x'.repeat(9000) + 'END' },
  ],
  'agent-new001': [
    { key: 'agent-old001', role: 'person', at: NOW - 90000, text: 'first ask in the chain', name: 'Sample Person' },
    { key: 'agent-old001', role: 'agent', at: NOW - 89500, text: 'The first answer.' },
    { key: 'agent-new001', role: 'person', at: NOW - 3000, text: 'a follow-up', name: 'Sample Person' },
  ],
};
const USAGE = { models: [
  { model: 'claude-opus-4-5-20251101', calls: 4, cache_read: 120000, cache_write: 8000, input: 3000, output: 1500, usd: 0.42 },
  { model: 'claude-haiku-4-5', calls: 2, cache_read: 1000, cache_write: 0, input: 500, output: 200, usd: 0.01 },
] };

const feed = (name: string, data: unknown) => ({ name, data, age_seconds: 0, interval: 30, error: null, refreshing: false, fetched_at: NOW });
const hello = (admin = true) => ({ v: 1, epoch: 'e1', sid: 's1', viewer: { user: 'user@example.com', admin, teams: admin ? ['example'] : [] }, retention_s: 300, max_life_s: 900 });
const snapshot = (sessions: Row[]) => ({
  feeds: {
    agents: feed('agents', { sessions, session_idle_seconds: 600, session_max_run_seconds: 5400, session_models: { claude: 'claude-opus-4-5' } }),
    snapshot: feed('snapshot', { team: { repo: 'example/repo' }, open_prs: [{ number: 12 }], review: [], inflight: [] }),
    teams: feed('teams', [{ profile: 'fxa', label: 'FxA' }, { profile: 'example', label: 'Example' }]),
  },
  sessions, errors: [], stats: null, flow: [],
});

type Got = { status: number; body: unknown };
type Opt = { admin?: boolean; sessions?: Row[]; hist?: (key: string) => Got | null | Promise<Got>; usage?: () => Got };
let seq = 1;
// Opens the page on a hash, with the fake stream, then sends hello and a snapshot.
async function open(page: Page, hash: string, o: Opt = {}) {
  await page.addInitScript(() => {
    class FakeES extends EventTarget {
      onopen: ((e: Event) => void) | null = null;
      onerror: ((e: Event) => void) | null = null;
      constructor(public url: string) {
        super();
        (window as unknown as { __es: FakeES }).__es = this;
        setTimeout(() => this.onopen?.(new Event('open')));
      }
      close() {}
      send(event: string, data: unknown, id: string) { this.dispatchEvent(new MessageEvent(event, { data: JSON.stringify(data), lastEventId: id })); }
    }
    (window as unknown as { EventSource: unknown }).EventSource = FakeES;
  });
  await page.route('**/api/history*', async (r) => {
    const key = new URL(r.request().url()).searchParams.get('key') ?? '';
    const got = (await o.hist?.(key)) ?? { status: 200, body: HIST[key] ?? [] };
    return r.fulfill({ status: got.status, contentType: 'application/json', body: JSON.stringify(got.body) });
  });
  await page.route('**/api/usage*', (r) => {
    const got = o.usage?.() ?? { status: 200, body: USAGE };
    return r.fulfill({ status: got.status, contentType: 'application/json', body: JSON.stringify(got.body) });
  });
  await page.route('**/api/media*', (r) => r.fulfill({ status: 404, body: '' }));
  await page.goto(`/v2/${hash}`);
  await page.waitForFunction(() => 'send' in ((window as unknown as { __es?: object }).__es ?? {}));
  await send(page, 'hello', hello(o.admin ?? true));
  await send(page, 'snapshot', snapshot(o.sessions ?? SESSIONS), true);
}
const send = (page: Page, event: string, data: unknown, ring = false) =>
  page.evaluate(([e, d, id]) => (window as unknown as { __es: { send: (e: string, d: unknown, id: string) => void } }).__es.send(e as string, d, id as string),
    [event, data, ring ? `e1-${seq++}` : ''] as const);
const delta = (page: Page, rows: Row[], deleted: string[] = []) => send(page, 'delta', { tbl: 'sessions', rows, deleted }, true);

const side = (page: Page) => page.locator('#side');
const bar = (page: Page) => page.locator('#sx-bar');
const right = (page: Page) => page.locator('#right');
const kv = (page: Page, label: string) => right(page).locator('.kvl > div').filter({ has: page.locator(`span:text-is("${label}")`) }).locator('b');
const tabN = (page: Page, tab: string) => page.locator(`#vtabs a[href="#sessions/${tab}"] .n`);

test('tabs and states: each tab counts its heads; #sessions picks the first tab with a row', async ({ page }) => {
  await open(page, '#sessions');
  await expect(page).toHaveURL(/#sessions\/live$/);
  await expect(tabN(page, 'live')).toHaveText('3');
  await expect(tabN(page, 'paused')).toHaveText('1');
  // agent-old001 is behind agent-new001, so stopped counts one head.
  await expect(tabN(page, 'stopped')).toHaveText('1');
  await expect(side(page).locator('.si .m').first()).toContainText('working');
  await page.goto('/v2/#sessions/stopped');
  await expect(side(page).locator('.si .m')).toContainText(['boot failed']);
});

test('list: day groups, titles, meta, the created tooltip, and the search over key, owner and requests', async ({ page }) => {
  await open(page, '#sessions/paused');
  await expect(side(page).locator('.sgroup')).toHaveText(['Today']);
  // A resume is titled by what the person first asked.
  const it = side(page).locator('.si').first();
  await expect(it.locator('.t')).toHaveText('first ask in the chain');
  await expect(it).toHaveAttribute('title', /\d/);
  await expect(it.locator('.m')).toContainText('Sample Person');
  await expect(it.locator('.m')).toContainText('PR open');
  await page.goto('/v2/#sessions/stopped');
  await expect(side(page).locator('.sgroup')).toHaveText(['This week']);
  await page.goto('/v2/#sessions/live');
  await page.locator('#q').fill('other sample');
  await expect(side(page).locator('.si .t')).toHaveText(['check the other sample']);
  await page.locator('#q').fill('agent-fix001');
  await expect(side(page).locator('.si .t')).toHaveText(['Dependency fix: #90001 (label by octo-example)']);
});

test('Person select: owners on the current tab only, by id, saved in localStorage.sowner', async ({ page }) => {
  await open(page, '#sessions/live');
  const pick = page.locator('#sowner');
  await expect(pick.locator('option')).toHaveText(['Everyone', 'Other Person', 'Sample Person', 'U-ROUTINE']);
  await pick.selectOption({ label: 'Other Person' });
  await expect(side(page).locator('.si .t')).toHaveText(['check the other sample']);
  expect(await page.evaluate(() => localStorage.getItem('sowner'))).toBe('U2');
  // Paused has only Sample Person: the other owner is not offered, and the list says so.
  await page.goto('/v2/#sessions/paused');
  await expect(page.locator('#s-sess')).toContainText('No paused session. See stopped sessions');
  await expect(page.locator('#s-sess a[href="#sessions/stopped"]')).toHaveText('See stopped sessions');
});

test('Team chip: a team link filters the list, and the chip clears it', async ({ page }) => {
  await open(page, '#sessions/live?team=example');
  await expect(side(page).locator('.si')).toHaveCount(1);
  const chip = page.getByRole('button', { name: /Clear the team filter/ });
  await expect(chip).toHaveText('Team: Example ×');
  await chip.click();
  await expect(side(page).locator('.si')).toHaveCount(3);
  await expect(page).toHaveURL(/#sessions\/live$/);
});

test('selection: the hash session when in the tab, else the first head; the details read the same one', async ({ page }) => {
  await open(page, '#sessions/live/agent-live02');
  await expect(bar(page).locator('.key')).toHaveText('agent-live02');
  await expect(kv(page, 'Owner')).toHaveText('Other Person');
  await expect(side(page).locator('.si[aria-current]')).toHaveAttribute('data-id', 'agent-live02');
  // agent-old001 is stopped: the live tab shows its first head in the feed order, as v1 does.
  await page.goto('/v2/#sessions/live/agent-old001');
  await expect(bar(page).locator('.key')).toHaveText('agent-live01');
  await expect(kv(page, 'Owner')).toHaveText('Sample Person');
});

test('empty: "No <tab> session." with "See stopped sessions", and none on stopped; no details panel', async ({ page }) => {
  await open(page, '#sessions/paused', { sessions: SESSIONS.filter((x) => x.state !== 'paused' && x.state !== 'stopped') });
  await expect(page.locator('#s-sess')).toContainText('No paused session. See stopped sessions');
  await expect(right(page)).toBeHidden();
  await page.goto('/v2/#sessions/stopped');
  await expect(page.locator('#s-sess')).toHaveText('No stopped session.');
});

test('gated fix: a viewer who is not a team admin sees only that it runs', async ({ page }) => {
  await open(page, '#sessions/live/agent-fix001', { admin: false, sessions: SESSIONS.map((x) => (x.key === 'agent-fix001' ? { ...x, fix_pr: undefined, fix_run: true } : x)) });
  await expect(bar(page)).toHaveText('Dependency fixworking');
  await expect(page.locator('.convo')).toHaveText('Dependency fix. Only a team admin can see its PR, trigger, cost and conversation.');
  await expect(page.getByRole('log')).toHaveCount(0);
  await expect(right(page).locator('.kvl > div span')).toHaveText(['State', 'Routine', 'Started']);
  await expect(right(page)).toContainText('Only a team admin can see its PR, trigger and cost.');
  // Its request is a team admin's, so the search finds it by key only.
  await page.locator('#q').fill('failing checks');
  await expect(side(page).locator('.si')).toHaveCount(0);
});

test('bar: dot, key, title, status with pauses in, Slack link, and the Terminal toggle saved in localStorage.sx', async ({ page }) => {
  await open(page, '#sessions/live/agent-live02');
  await expect(bar(page).getByRole('img')).toHaveAccessibleName('waiting on owner');
  await expect(bar(page).locator('.sxt')).toHaveText('check the other sample');
  await expect(bar(page).locator('.sxm')).toHaveText(/^waiting on owner · pauses in [45]m$/);
  await page.goto('/v2/#sessions/live/agent-live01');
  await expect(bar(page).getByRole('link', { name: 'Slack ↗' })).toHaveAttribute('href', /example\.slack\.com/);
  const t = bar(page).getByRole('button', { name: 'Terminal' });
  await expect(t).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('log')).toBeVisible();
  await t.click();
  await expect(t).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('log')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('sx'))).toBe('{"term":false}');
});

test('outcome: the PR shows once, with its state; conversation count; notes with Show all; media count', async ({ page }) => {
  await open(page, '#sessions/paused/agent-new001');
  const out = page.locator('#sx-outcome');
  await expect(out.getByRole('link', { name: 'example/repo #12 ↗' })).toHaveAttribute('href', 'https://github.com/example/repo/pull/12');
  await expect(out).toContainText('open');
  await expect(page.locator('#main a[href$="/pull/12"]')).toHaveCount(1);
  await expect(out).toContainText('Conversation2 sessions');
  await expect(out.locator('.notes')).toContainText('…');
  await out.getByRole('button', { name: 'Show all' }).click();
  await expect(out.locator('.notes')).not.toContainText('…');
  await page.goto('/v2/#sessions/live/agent-live01');
  await expect(page.locator('#sx-outcome')).toContainText('Media2 files in the thread');
});

test('thread: loading, error and nothing recorded', async ({ page }) => {
  let mode = 'slow';
  let release = () => {};
  const held = new Promise<void>((r) => { release = r; });
  await open(page, '#sessions/live/agent-live02', {
    hist: async () => {
      if (mode === 'slow') await held;
      return mode === 'error' ? { status: 500, body: { error: 'no' } } : { status: 200, body: [] };
    },
  });
  await expect(page.locator('#sx-thread')).toHaveText('loading…');
  mode = 'empty';
  release();
  await expect(page.locator('#sx-thread')).toHaveText('nothing recorded');
  mode = 'error';
  await page.goto('/v2/#sessions/live/agent-live01');
  await expect(page.locator('#sx-thread')).toHaveText('could not load the conversation');
});

test('thread: Markdown, avatars, actions, media after the reply, and safe links', async ({ page }) => {
  await open(page, '#sessions/live/agent-live01');
  const th = page.locator('#sx-thread');
  await expect(th.locator('.tsep').first()).toContainText('agent-live01 · ');
  await expect(th.getByRole('heading', { level: 3, name: 'Plan' })).toBeVisible();
  // Slack bold: *read* is bold on purpose.
  await expect(th.locator('b', { hasText: 'read' })).toHaveCount(1);
  await expect(th.locator('pre code')).toHaveText('code here');
  await expect(th.getByRole('link', { name: 'a link' })).toHaveAttribute('rel', 'noopener');
  await expect(th.getByRole('link', { name: 'bad' })).toHaveCount(0);
  await expect(th.locator('script')).toHaveCount(0);
  await expect(th.locator('.tact')).toHaveText('Opened a draft');
  await expect(th.locator('.tmsg.agent img.av').first()).toHaveAttribute('src', '/icon.png');
  await expect(th.locator('.tmsg:not(.agent) img.av')).toHaveAttribute('referrerpolicy', 'no-referrer');
  await expect(th.locator('.tmsg:not(.agent) span.av svg')).toHaveCount(1);
  // The two files group into one message, after the reply that closes their turn.
  const media = th.locator('.media');
  await expect(media).toHaveCount(1);
  await expect(th.locator('.who', { hasText: 'shared a' }).or(th.locator('.who', { hasText: 'shared 2' }))).toContainText('shared 2 screenshots and videos');
  await expect(media.locator('video')).toHaveAttribute('src', /name=clip\.mp4/);
  await expect(media.locator('img')).toHaveAttribute('alt', 'shot.png');
  await expect(media.locator('figcaption')).toHaveText(['shot.png', 'clip.mp4']);
  const order = await th.locator(':scope > *').evaluateAll((els) => els.map((e) => (e.querySelector('.media') ? 'media' : e.textContent?.includes('A long reply') ? 'long' : 'x')));
  expect(order.lastIndexOf('long')).toBeLessThan(order.indexOf('media'));
});

test('thread: Show more stays per message across updates, and a message past 8000 characters reads in full', async ({ page }) => {
  await open(page, '#sessions/live/agent-live01');
  const more = page.locator('#sx-thread').getByRole('button', { name: 'Show more' });
  // Two messages share a key and a time: each has its own button (the v1 ids collided).
  await expect(more).toHaveCount(3);
  await more.first().click();
  await expect(page.locator('#sx-thread').getByRole('button', { name: 'Show less' })).toHaveCount(1);
  await expect(page.locator('#sx-thread .md.clip')).toHaveCount(2);
  await delta(page, [{ ...SESSIONS[0], turns: 4, last_activity: NOW }]);
  await expect(page.locator('#sx-thread').getByRole('button', { name: 'Show less' })).toHaveCount(1);
  await expect(page.locator('#sx-thread')).not.toContainText('END');
  await page.getByRole('button', { name: 'Show the whole message' }).click();
  await expect(page.locator('#sx-thread')).toContainText('END');
});

test('thread: a separator names the resumed session', async ({ page }) => {
  await open(page, '#sessions/paused/agent-new001');
  await expect(page.locator('#sx-thread .tsep')).toHaveText([/^agent-old001 · /, /^Resumed as agent-new001 · /]);
});

test('the thread DOM, the scroll place, the images and the terminal stay across updates', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  await open(page, '#sessions/live/agent-live01');
  await send(page, 'tail', { key: 'agent-live01', start: 0, lines: ['first line', 'second line'] }, true);
  await expect(page.getByRole('log')).toContainText('second line');
  await page.locator('#sx-thread .tmsg').first().evaluate((e) => { (e as unknown as { mark: number }).mark = 1; });
  await page.locator('#sx-thread .media img').evaluate((e) => { (e as unknown as { mark: number }).mark = 1; });
  await page.getByRole('log').locator('div').first().evaluate((e) => { (e as unknown as { mark: number }).mark = 1; });
  await page.locator('#main').evaluate((e) => { e.scrollTop = 300; });
  await delta(page, [{ ...SESSIONS[0], turns: 5, last_activity: NOW }]);
  await send(page, 'tail', { key: 'agent-live01', start: 2, lines: ['third line'] }, true);
  await expect(page.getByRole('log')).toContainText('third line');
  expect(await page.locator('#sx-thread .tmsg').first().evaluate((e) => (e as unknown as { mark?: number }).mark)).toBe(1);
  expect(await page.locator('#sx-thread .media img').evaluate((e) => (e as unknown as { mark?: number }).mark)).toBe(1);
  expect(await page.getByRole('log').locator('div').first().evaluate((e) => (e as unknown as { mark?: number }).mark)).toBe(1);
  expect(await page.locator('#main').evaluate((e) => e.scrollTop)).toBe(300);
});

test('terminal: title, states, a 200-line window, the read-aloud toggle, and the tail subscriptions', async ({ page }) => {
  const posts: unknown[] = [];
  await page.route('**/api/live/tails', (r) => { posts.push(r.request().postDataJSON()); return r.fulfill({ contentType: 'application/json', body: '{"ok":true}' }); });
  await open(page, '#sessions/live/agent-live01');
  const term = page.getByRole('region', { name: 'agent@sandbox: agent-live01' });
  await expect(term).toContainText('running');
  await expect.poll(() => posts.at(-1)).toEqual({ sid: 's1', keys: ['agent-live01'] });
  await send(page, 'tail', { key: 'agent-live01', start: 0, lines: Array.from({ length: 250 }, (_, i) => `line ${i}`) }, true);
  await expect(page.getByRole('log').locator('div')).toHaveCount(200);
  await expect(page.getByRole('log')).toHaveAttribute('aria-live', 'off');
  await term.getByRole('button', { name: 'Read new lines aloud' }).click();
  await expect(page.getByRole('log')).toHaveAttribute('aria-live', 'polite');
  // Another session: only its terminal streams.
  await page.goto('/v2/#sessions/live/agent-live02');
  await expect(page.getByRole('region', { name: 'agent@sandbox: agent-live02' })).toContainText('connecting…');
  await expect.poll(() => posts.at(-1)).toEqual({ sid: 's1', keys: ['agent-live02'] });
  await send(page, 'tail', { key: 'agent-live02', start: 0, lines: ['a line'] }, true);
  await expect(page.getByRole('region', { name: 'agent@sandbox: agent-live02' })).toContainText('waiting on you');
  await bar(page).getByRole('button', { name: 'Terminal' }).click();
  await expect.poll(() => posts.at(-1)).toEqual({ sid: 's1', keys: [] });
});

test('terminal: a tail read that fails says output unavailable (polling mode)', async ({ page }) => {
  await page.route('**/api/live*', (r) => r.fulfill({ contentType: 'text/event-stream', body: 'event: bye\ndata: {"reason":"off"}\n\n' }));
  await page.route('**/api/tail*', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"no"}' }));
  await page.goto('/v2/#sessions/live/agent-ex0001');
  // The poller reads the shown tails every 5 s.
  await expect(page.getByRole('region', { name: 'agent@sandbox: agent-ex0001' })).toContainText('output unavailable', { timeout: 12000 });
});

test('terminal: at 1200 px or less it stacks under the thread', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await open(page, '#sessions/live/agent-live01');
  const t = await page.getByRole('log').boundingBox(), th = await page.locator('#sx-thread').boundingBox();
  expect(t!.y).toBeGreaterThan(th!.y);
});

test('details: the session facts, the timeline, the conversation chain and the runner facts', async ({ page }) => {
  await open(page, '#sessions/paused/agent-new001');
  await expect(kv(page, 'State')).toHaveText('paused · a reply resumes');
  await expect(kv(page, 'Agent')).toHaveText('Claude · claude-opus-4-5');
  await expect(kv(page, 'Cost, 2 sessions')).toHaveText('$0.20 · this session —');
  await expect(kv(page, 'Turns')).toHaveText('3 · this session 1');
  await expect(kv(page, 'Owner')).toHaveText('Sample Person');
  // The older session is stopped: the link goes to its real tab.
  await expect(kv(page, 'Resumed from').getByRole('link')).toHaveAttribute('href', '#sessions/stopped/agent-old001');
  await expect(right(page).getByRole('list', { name: 'Conversation' }).getByRole('listitem')).toHaveCount(2);
  await expect(right(page).getByRole('img', { name: /^2 sessions, from / })).toBeVisible();
  await expect(kv(page, 'Busy, idle')).toHaveText('not recorded for this session');
  await expect(kv(page, 'Verify runs')).toHaveText('not recorded for this session');
  await page.goto('/v2/#sessions/stopped/agent-fail01');
  await expect(kv(page, 'Stopped because')).toHaveText('boot failed');
  await page.goto('/v2/#sessions/live/agent-live02');
  await expect(kv(page, 'Idle pause in').getByRole('img')).toHaveAccessibleName(/^Idle pause in: [45]m$/);
  await expect(kv(page, 'Sandbox ends in').getByRole('img')).toHaveAccessibleName(/^Sandbox ends in: 1\.[23]h$/);
  await expect(kv(page, 'Busy, idle')).toHaveText('recorded when it stops');
});

test('details: usage by model with its Total, and the loading, empty and error texts', async ({ page }) => {
  let mode = 'ok';
  await open(page, '#sessions/live/agent-live01', { usage: () => (mode === 'empty' ? { status: 200, body: { models: [] } } : mode === 'error' ? { status: 500, body: { error: 'no' } } : { status: 200, body: USAGE }) });
  const t = right(page).locator('table.table');
  await expect(t.locator('tbody tr')).toHaveText([/^Opus 4\.5/, /^Haiku 4\.5/, /^Total/]);
  await expect(right(page).getByRole('img', { name: /^Tokens of 2 models/ })).toBeVisible();
  mode = 'empty';
  await page.goto('/v2/#sessions/live/agent-live02');
  await expect(right(page)).toContainText('No LLM calls recorded for this run.');
  mode = 'error';
  await page.goto('/v2/#sessions/stopped/agent-fail01');
  await expect(right(page)).toContainText('Could not read the LLM calls for this run.');
});

const ANSWERS = [
  { src: 'answer', key: 'agent-ans001', q: 'what is the sample?', kind: 'answered', at: iso(3600), secs: 12, turns: 2, usd: 0.03, thread: 'C1:1700000000.000200' },
  // An offset time: parsed, it is older than the row above, though its text sorts after it.
  { src: 'answer', key: 'agent-ans002', q: '', kind: 'upgraded', at: new Date((NOW - 7200 + 5 * 3600) * 1000).toISOString().replace('Z', '+05:00'), secs: 200, turns: 5, usd: null, thread: 'C9:1' },
  { src: 'answer', key: 'agent-ans003', q: 'an old one', kind: 'failed', at: iso(86400 * 60), secs: 3, turns: 1, usd: 0.01, thread: '' },
];

test('answers: the rows of the Stats range, the columns, the tags, the cost breakdown and the sort by time', async ({ page }) => {
  await page.route('**/api/stats*', (r) => r.fulfill({ contentType: 'application/json', headers: { ETag: '"a1"' }, body: JSON.stringify({ rows: ANSWERS, prs: [] }) }));
  await open(page, '#sessions/answers');
  const main = page.locator('#s-sess');
  // The third row is older than the 30-day range.
  await expect(main.locator('.anshead')).toHaveText('2 quick answers in the Stats range: read-only, no sandbox. Upgraded ones continue as a session.');
  await expect(main.locator('table.answers > thead th')).toHaveText(['When', 'Answer', 'Outcome', 'Time', 'Turns', 'Cost', 'Thread']);
  const rows = main.locator('table.answers > tbody > tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('what is the sample?');
  await expect(rows.nth(0).locator('td').nth(5)).toHaveText('$0.03');
  await expect(rows.nth(1).locator('td').nth(5)).toHaveText('—');
  await expect(rows.nth(0).getByRole('link', { name: 'Slack ↗' })).toHaveAttribute('href', 'https://example.slack.com/archives/C1/p1700000000000200');
  await expect(rows.nth(1).locator('td').nth(6)).toHaveText('C9:1');
  await expect(rows.nth(1).locator('td').nth(2)).toHaveText('upgraded');
  const b = rows.nth(0).getByRole('button', { name: 'Show the cost breakdown of what is the sample?' });
  await expect(b).toHaveAttribute('aria-expanded', 'false');
  await b.click();
  await expect(rows.nth(0).getByRole('button', { name: 'Hide the cost breakdown of what is the sample?' })).toHaveAttribute('aria-expanded', 'true');
  await expect(rows.nth(1)).toContainText('Opus 4.5');
  await expect(page.getByRole('img', { name: /^2 answers on / })).toBeVisible();
  await expect(page.locator('#side')).toBeHidden();
});

for (const theme of ['light', 'dark'] as const) {
  test(`axe: no serious or critical issue on the Sessions routes in the ${theme} theme`, async ({ page }) => {
    await page.route('**/api/stats*', (r) => r.fulfill({ contentType: 'application/json', headers: { ETag: '"a1"' }, body: JSON.stringify({ rows: ANSWERS, prs: [] }) }));
    await page.emulateMedia({ colorScheme: theme });
    await open(page, '#sessions/live/agent-live01');
    await send(page, 'tail', { key: 'agent-live01', start: 0, lines: ['[tool] Bash npm test', 'PASS sample', 'FAIL other', 'status: ok'] }, true);
    const bad: string[] = [];
    for (const h of ['#sessions/live/agent-live01', '#sessions/live/agent-live02', '#sessions/paused/agent-new001', '#sessions/stopped', '#sessions/answers']) {
      await page.evaluate((x) => { location.hash = x; }, h);
      await expect(page.locator('#s-sess')).toBeVisible();
      await page.waitForTimeout(300);
      for (const s of await page.getByText('Show as table').all()) if (await s.isVisible()) await s.click();
      const { violations } = await new AxeBuilder({ page }).analyze();
      bad.push(...violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${h} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`));
    }
    expect(bad).toEqual([]);
  });
}
