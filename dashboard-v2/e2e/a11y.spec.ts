// The accessibility pass of every route (design section 7): axe in both themes, the keyboard, focus, chart tables
// and reduced motion, on the basic live fixture.
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 900 } });

// Every route of the router, with a selection where a view has one.
const ROUTES: [hash: string, h1: string][] = [
  ['#overview', 'Overview'],
  ['#pipeline/belts', 'Pipeline'], ['#pipeline/belts/EX-101', 'Pipeline'], ['#pipeline/queue', 'Pipeline'], ['#pipeline/done', 'Pipeline'],
  ['#sessions/live', 'Sessions'], ['#sessions/live/agent-ex0001', 'Sessions'], ['#sessions/paused', 'Sessions'], ['#sessions/stopped', 'Sessions'], ['#sessions/answers', 'Sessions'],
  ['#stats/spend', 'Stats'], ['#stats/prs', 'Stats'], ['#stats/runners', 'Stats'], ['#stats/pipeline', 'Stats'],
  ['#errors/open', 'Errors'], ['#errors/all/a1b2c3d4e5', 'Errors'],
  ['#runners/all', 'Sandboxes'], ['#runners/pipeline', 'Sandboxes'], ['#runners/slack', 'Sandboxes'], ['#runners/routines', 'Sandboxes'],
  ['#teams', 'Teams'], ['#teams/new', 'Teams'], ['#teams/fxa', 'Teams'], ['#teams/example/settings', 'Teams'], ['#teams/example/routines', 'Teams'],
  ['#teams/fxa/memory', 'Teams'],
];

type Frame = { id?: string; event: string; data: Record<string, unknown> };
type J = ReturnType<typeof JSON.parse>;
const BASIC = readFileSync(new URL('../fixtures/live/basic.ndjson', import.meta.url), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Frame);
const sse = (fs: Frame[]) => fs.map((f) => `${f.id ? `id: ${f.id}\n` : ''}event: ${f.event}\ndata: ${JSON.stringify(f.data)}\n\n`).join('');

// The stream answers basic's hello and first snapshot. push(edit) answers the next reconnect with an edited copy of
// that snapshot, as a live update, and returns when the page shows it (the repo name in the status bar).
async function live(page: Page) {
  const [hello, snap] = BASIC.slice(0, 2) as [Frame, Frame];
  const next: ((fs: Frame[]) => void)[] = [];
  let n = 0;
  await page.route(/\/api\/live(\?|$)/, async (r) => {
    const fs = n++ === 0 ? [hello, snap] : await new Promise<Frame[]>((res) => next.push(res));
    await r.fulfill({ contentType: 'text/event-stream', body: sse(fs) });
  });
  return async (edit: (d: J) => void = () => {}) => {
    const s = structuredClone(snap);
    s.id = `e5a17c0d-${1000 + n}`;
    const d = s.data as J, repo = `example/repo-${n}`;
    for (const f of Object.values(d.feeds) as J[]) f.age_seconds += 5;
    d.feeds.snapshot.data.repo = repo;
    edit(d);
    await expect.poll(() => next.length, { timeout: 10_000 }).toBeGreaterThan(0);
    next.shift()!([hello, s]);
    await expect(page.locator('#repo')).toHaveText(repo);
  };
}

async function open(page: Page, hash: string, h1: string) {
  await page.goto(`/v2/${hash}`);
  await expect(page.locator('#vtitle')).toHaveText(h1);
  await expect(page.locator('#main > .mc')).not.toContainText(/^loading…$|loading teams/);
  // A lazy chart adds its figure when it loads, which moves the figures after it.
  await expect(page.locator('#main [data-lazy]')).toHaveCount(0);
}

for (const theme of ['light', 'dark'] as const) {
  for (const [hash, h1] of ROUTES) {
    test(`axe: ${hash} has no serious or critical issue in the ${theme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await open(page, hash, h1);
      // Open every disclosure, so the chart tables and the closed parts are checked too.
      await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
      const { violations } = await new AxeBuilder({ page }).analyze();
      const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }
}

// One Tab step, read in the page: where the focus is, and whether it follows the last stop in the DOM.
function step() {
  const w = window as unknown as { __stops?: Element[] };
  const el = document.activeElement;
  const stops = (w.__stops ??= []);
  if (!el || el === document.body || el === stops[0]) return null;
  const prev = stops[stops.length - 1];
  stops.push(el);
  const desc = (e: Element) => `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}${e.getAttribute('data-id') ? `[${e.getAttribute('data-id')}]` : ''} "${(e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 40)}"`;
  const ring = (s: CSSStyleDeclaration) => s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2;
  const box = el.closest('.search');
  const r = el.getBoundingClientRect();
  const img = el.parentElement?.closest('[role=img]');
  return {
    at: desc(el),
    order: !prev || !!(prev.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING),
    shown: r.width > 0 && r.height > 0,
    ring: ring(getComputedStyle(el)) || ring(getComputedStyle(el, '::after')) || (!!box && ring(getComputedStyle(box))),
    inChart: img ? desc(img) : '',
    chart: el.matches('figure [role=img]'),
  };
}

for (const [hash, h1] of ROUTES) {
  test(`keyboard: ${hash}: Tab reaches each control once, in DOM order, with the focus outline; a chart is one stop`, async ({ page }) => {
    await open(page, hash, h1);
    // A click on the logo puts the start of the Tab order at the top of the page.
    await page.locator('nav.rail img.logo').click();
    const stops: NonNullable<ReturnType<typeof step>>[] = [];
    for (let i = 0; i < 1500; i++) {
      await page.keyboard.press('Tab');
      const s = await page.evaluate(step);
      if (!s) break;
      stops.push(s);
    }
    expect(stops.length).toBeGreaterThan(10);
    expect(stops[0]!.at).toMatch(/^a "Overview/);
    expect(stops.filter((s) => !s.order).map((s) => s.at), 'out of DOM order').toEqual([]);
    expect(stops.filter((s) => !s.shown).map((s) => s.at), 'not on screen').toEqual([]);
    expect(stops.filter((s) => !s.ring).map((s) => s.at), 'no focus outline').toEqual([]);
    expect(stops.filter((s) => s.inChart).map((s) => `${s.at} in ${s.inChart}`), 'a stop inside a chart').toEqual([]);
    expect(stops.filter((s) => s.chart).length, 'one stop per chart').toBe(await page.locator('figure [role=img]').count());
    expect(await page.locator('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])').count()).toBe(0);
  });

  test(`charts: ${hash}: each chart is an image with a summary, keys that name a point, and the full data as a table`, async ({ page }) => {
    await open(page, hash, h1);
    for (const f of await page.locator('figure').all()) {
      const title = (await f.locator('figcaption').textContent()) ?? '';
      const img = f.locator('[role=img]').first();
      expect((await img.getAttribute('aria-label'))?.length ?? 0, title).toBeGreaterThan(10);
      await f.getByText('Show as table').click();
      const t = f.locator('details table');
      await expect(t.locator('caption')).toHaveText(title);
      const cols = await t.locator('thead th').count();
      expect(cols, title).toBeGreaterThan(0);
      for (const row of await t.locator('tbody tr').all()) expect(await row.locator('td, th').count(), title).toBe(cols);
      // A chart with data names the point that Home focuses, in a polite live region.
      if (await t.locator('tbody tr').count()) {
        await img.focus();
        await page.keyboard.press('End');
        await page.keyboard.press('Home');
        await expect(f.locator('[aria-live=polite]'), title).not.toHaveText('');
      }
    }
  });

  test(`focus: ${hash}: a live update keeps the focus on the same control`, async ({ page }) => {
    const push = await live(page);
    await open(page, hash, h1);
    // The first and the last control of the view, the first side list item, and a chart after an arrow key.
    const main = page.locator('#main > .mc').locator('a[href], button:not([disabled]), input:not([disabled]), select, summary, [tabindex="0"]');
    const picks = [main.first(), main.last(), page.locator('#side .si').first(), page.locator('figure [role=img]').first()];
    for (const el of picks) {
      if (!(await el.count()) || !(await el.isVisible())) continue;
      await el.focus();
      if (await el.evaluate((e) => e.matches('[role=img]'))) await page.keyboard.press('ArrowRight');
      await el.evaluate((e) => e.setAttribute('data-was-focused', ''));
      await push();
      await expect(page.locator('[data-was-focused]')).toBeFocused();
      await page.locator('[data-was-focused]').evaluate((e) => e.removeAttribute('data-was-focused'));
    }
  });

  test(`reduced motion: ${hash}: nothing animates on load or on a live update`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await moved(page);
    const push = await live(page);
    await open(page, hash, h1);
    const running = () => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').map((a) => (a as CSSAnimation).animationName || 'script'));
    expect(await running()).toEqual([]);
    await push(change);
    for (let i = 0; i < 5; i++) {
      expect(await running()).toEqual([]);
      await page.waitForTimeout(60);
    }
    expect(await page.evaluate(() => (window as unknown as { __moved: string[] }).__moved)).toEqual([]);
  });
}

// The update of the motion tests: a belt leaves, so the rows under it move up, and a session starts.
const change = (d: J) => {
  const snap = d.feeds.snapshot.data, ag = d.feeds.agents.data;
  snap.inflight = snap.inflight.filter((t: J) => t.key !== 'EX-101');
  ag.runners = ag.runners.filter((r: J) => r.key !== 'EX-101');
  d.sessions = [{ ...d.sessions[0], key: 'agent-ex0099', created: d.sessions[0].created + 60 }, ...d.sessions];
};

// Motion moves an element with an inline transform from its own frame loop, which getAnimations() does not see.
const moved = (page: Page) => page.addInitScript(() => {
  const w = window as unknown as { __moved: string[] };
  w.__moved = [];
  new MutationObserver((ms) => {
    for (const m of ms) {
      const el = m.target as HTMLElement;
      const t = el.style?.transform;
      if (t && t !== 'none' && el.closest('[data-belt]')) w.__moved.push(`${el.tagName} ${t}`);
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['style'] });
});

test('reduced motion: the probe sees the Motion belt move when reduced motion is off', async ({ page }) => {
  await moved(page);
  const push = await live(page);
  await open(page, '#pipeline/belts', 'Pipeline');
  await push(change);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __moved: string[] }).__moved.length)).toBeGreaterThan(0);
});

test('focus: a side list item that an update removes gives the focus to the list, and a polite message says so', async ({ page }) => {
  const push = await live(page);
  await open(page, '#sessions/stopped', 'Sessions');
  await page.locator('#side .si[data-id="agent-ex0004"]').focus();
  await push((d) => {
    const keep = (s: J) => s.key !== 'agent-ex0004';
    d.sessions = d.sessions.filter(keep);
    d.feeds.agents.data.sessions = d.feeds.agents.data.sessions.filter(keep);
  });
  await expect(page.locator('#side .si[data-id="agent-ex0004"]')).toHaveCount(0);
  await expect(page.locator('#side .slist2')).toBeFocused();
  await expect(page.locator('#focus-say')).toHaveText('The item you were on is gone.');
});

test('focus: a new view or tab moves the focus to its heading; a selection in the same tab keeps it', async ({ page }) => {
  await open(page, '#overview', 'Overview');
  const rail = page.getByRole('navigation', { name: 'Views' });
  for (const v of ['Pipeline', 'Sessions', 'Stats', 'Errors', 'Sandboxes', 'Teams', 'Overview']) {
    await rail.getByRole('link', { name: new RegExp(`^${v}`) }).click();
    await expect(page.locator('#vtitle')).toHaveText(v);
    await expect(page.locator('#vtitle')).toBeFocused();
  }
  // By keyboard: Enter on a rail link, then on a tab link.
  await rail.getByRole('link', { name: /^Errors/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#vtitle')).toBeFocused();
  await page.getByRole('navigation', { name: 'Errors tabs' }).getByRole('link', { name: /^All/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#errors\/all/);
  await expect(page.locator('#vtitle')).toBeFocused();
  // Back goes to the last tab, with the focus on the heading again.
  await page.locator('#q').focus();
  await page.goBack();
  await expect(page).toHaveURL(/#errors\/open/);
  await expect(page.locator('#vtitle')).toBeFocused();
  // A side list pick changes only the selection: the focus stays on the pick.
  await page.goto('/v2/#errors/all');
  const pick = page.locator('#side .si').nth(1);
  await pick.click();
  await expect(page).toHaveURL(new RegExp(`#errors/all/${await pick.getAttribute('data-id')}$`));
  await expect(pick).toBeFocused();
  // A team page takes the focus to the team heading.
  await page.goto('/v2/#teams');
  await page.locator('#side .si[data-id="fxa"]').click();
  await expect(page.locator('#team-h')).toBeFocused();
});

test('palette: Ctrl+K takes the focus, keeps Tab inside, Esc gives it back, and a pick moves it to the new heading', async ({ page }) => {
  await open(page, '#overview', 'Overview');
  await page.locator('#find').focus();
  await page.keyboard.press('Control+k');
  const input = page.getByRole('combobox');
  await expect(input).toBeFocused();
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('dialog[open]'))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.palette')).not.toHaveAttribute('open');
  await expect(page.locator('#find')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(input).toBeFocused();
  await input.fill('Stats: PRs');
  await expect(page.getByRole('option', { selected: true })).toContainText('Stats: PRs');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#stats\/prs$/);
  await expect(page.locator('#vtitle')).toBeFocused();
});

test('help: the dialog takes the focus, keeps Tab and Shift+Tab inside, and Esc gives the focus back', async ({ page }) => {
  await open(page, '#overview', 'Overview');
  await page.locator('#helpbtn').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#help-close')).toBeFocused();
  for (const k of ['Tab', 'Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
    await page.keyboard.press(k);
    expect(await page.evaluate(() => document.activeElement?.closest('dialog')?.id), k).toBe('help');
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#helpbtn')).toBeFocused();
});

for (const [hash, h1, btn, first] of [['#errors/all/a1b2c3d4e5', 'Errors', '#tright', '#rclose'], ['#sessions/live', 'Sessions', '#tside', '#q']] as const) {
  test(`drawers: ${btn} on a narrow screen opens a drawer that keeps Tab inside, and Esc gives the focus back`, async ({ page }) => {
    await page.setViewportSize({ width: 860, height: 800 });
    await open(page, hash, h1);
    await page.locator(btn).click();
    await expect(page.locator(first)).toBeFocused();
    const drawer = btn === '#tright' ? 'right' : 'side';
    const behind = `.rail, #main > .mc, footer.status, #${drawer === 'side' ? 'right' : 'side'}`;
    const inert = () => page.evaluate((q) => [...document.querySelectorAll<HTMLElement>(q)].map((e) => e.inert), behind);
    expect(await inert()).toEqual([true, true, true, true]);
    await expect(page.locator(btn)).not.toHaveAttribute('inert');
    for (const k of [...Array(6).fill('Tab'), ...Array(8).fill('Shift+Tab')] as string[]) {
      await page.keyboard.press(k);
      expect(await page.evaluate((id) => !!document.activeElement?.closest(`#${id}`), drawer), k).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(page.locator(btn)).toBeFocused();
    expect(await inert()).toEqual([false, false, false, false]);
  });
}
