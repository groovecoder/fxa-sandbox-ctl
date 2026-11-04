// @vitest-environment jsdom
// The pipeline view on the v1 pipeline page fixture, through the poll converters and the reducers of the real store.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { snapshotActions, viewerAction } from '../../live/poll';
import { type Action, apply } from '../../live/reducers';
import { beltGroups } from '../../model';
import { store } from '../../store';
import { Belts } from './belts';
import { doneRows, flowGraph, median, mergesPerDay, ageWords } from './data';
import { Done } from './done';
import { Queue } from './queue';

type J = ReturnType<typeof JSON.parse>;
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
Element.prototype.scrollIntoView ??= () => {};
// Vitest runs in dashboard-v2/; under jsdom import.meta.url is not a file URL.
const fixture = JSON.parse(readFileSync(`${process.cwd()}/../skills/fxa-ctl-dev/page-fixture-pipeline.json`, 'utf8'));

// page.sh: "@iso-3600" is an ISO time an hour before now.
const rel = (v: J, now: number): J => Array.isArray(v) ? v.map((x) => rel(x, now))
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rel(x, now)]))
    : typeof v === 'string' && /^@iso[+-]\d+$/.test(v) ? new Date((now + Number(v.slice(4))) * 1000).toISOString() : v;

const start = store.getState();
const d = (a: Action) => store.setState((s) => apply(s, a), true);
function load(fx: J = rel(fixture, Date.now() / 1000), hash = '#pipeline/belts') {
  store.setState(start, true);
  d(viewerAction({ data: fx['/api/team-admin'], etag: null }));
  snapshotActions(fx['/api/snapshot']).forEach(d);
  store.setState((s) => ({ route: { ...s.route, view: 'pipeline', tab: hash.split('/')[1]!, sel: decodeURIComponent(hash.split('/')[2] ?? '') } }));
  return fx;
}
// A new agents feed, as a feed frame from the stream gives it.
const agents = (f: (a: J) => void) => act(() => {
  const a = structuredClone(store.getState().feeds.agents!.data) as J;
  f(a);
  store.setState((s) => ({ feeds: { ...s.feeds, agents: { ...s.feeds.agents!, data: a } } }));
});

beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
afterEach(cleanup);

describe('the pure parts', () => {
  it('takes the true median, not the upper middle value', () => {
    expect(median([1, 2, 3, 10])).toBe(2.5);
    expect(median([4, 1, 9])).toBe(4);
    expect(median([])).toBeNull();
  });
  it('lists the merged tickets newest first and counts merges per day', () => {
    const now = Date.parse('2026-11-03T12:00:00Z');
    const rows = doneRows({ merged_prs: [
      { key: 'FXA-1', number: 1, merged: '2026-11-01T10:00:00Z', created: '2026-10-30T10:00:00Z' },
      { key: null, number: 2, merged: '2026-11-02T10:00:00Z', created: '2026-11-01T10:00:00Z' },
      { key: 'FXA-3', number: 3, merged: '2026-11-03T10:00:00Z', created: '2026-11-03T09:00:00Z' },
    ] });
    expect(rows.map((r) => r.t.key)).toEqual(['FXA-3', 'FXA-1']);
    expect(rows[1]!.took).toBe(2);
    expect(mergesPerDay(rows, 3, now)).toEqual([1, 0, 1]);
  });

  it('gives each age its unit word', () => {
    expect(ageWords({ age: 1, t: {} })).toBe('1 day');
    expect(ageWords({ t: { elapsed_seconds: 720 } })).toBe('12 min');
    expect(ageWords({ ageText: '3d', item: { age: 3 * 86400 }, t: {} })).toBe('3 days');
  });
  it('counts each ticket once in the flow, and a link carries the tickets past it', () => {
    const g = { working: [{ st: 2 }], needs: [{ st: 0 }], fixes: [{ st: 6 }], review: [{ st: 7 }] };
    const f = flowGraph(g, { queue: { ready: [{}], skipped: [{ in_queue: true, held_by: 'FXA-2' }, { in_queue: true }] }, review: [{ state: 'CLOSED' }] }, []);
    expect(f.n).toEqual({ ready: 1, held: 1, skipped: 1, run: 1, pr: 2, merged: 0, closed: 1 });
    expect(f.links.find((l) => l.source === 'queue' && l.target === 'run')!.value).toBe(4);
    expect(f.links.find((l) => l.source === 'run')!.value).toBe(3);
  });
});

describe('Belts', () => {
  it('shows the tiles, the groups with Working now first, and a belt on the agent rows only', () => {
    load();
    render(<Belts />);
    const tile = (l: string) => document.querySelector(`[data-stat="${l}"] .text-kpi`)!.textContent;
    expect([tile('Needs you'), tile('Agents working'), tile('Open PRs'), tile('Merged, 7 days')]).toEqual(['1', '2', '3', '1']);
    expect([...document.querySelectorAll('.bwrap [role=group]')].map((h) => h.getAttribute('aria-label'))).toEqual(['Working now', 'Review and merge', 'Decide', 'The agent fixes it, next pass']);
    const belts = [...document.querySelectorAll('[data-belt]')].filter((li) => li.querySelector('.trk [role=img][aria-label*="Stop "]')).map((li) => li.closest('[role=group]')?.getAttribute('aria-label'));
    expect(new Set(belts)).toEqual(new Set(['Working now']));
    expect(screen.getByText(/^Outside the pipeline \(2\)/)).toBeTruthy();
    expect(screen.getByRole('img', { name: /^Agent · 12 min, agent working\. Stop 3 of 9, Agent$/ })).toBeTruthy();
  });

  it('keeps the row and its focus when its belt moves to the next stop, and moves the node', () => {
    load();
    render(<Belts />);
    const li = document.querySelector('[data-belt="FXA-21"]')!, link = li.querySelector<HTMLElement>('[data-focus="row"]')!;
    link.focus();
    expect(li.querySelector('.trk [role=img]')!.getAttribute('aria-label')).toMatch(/Stop 2 of 9, Boot$/);
    agents((a) => { a.runners[1].stage = 'watching'; a.runners[1].agent = { last_tool: 'Bash yarn test' }; });
    const now = document.querySelector('[data-belt="FXA-21"]')!;
    expect(now).toBe(li);
    expect(now.querySelector('.trk [role=img]')!.getAttribute('aria-label')).toMatch(/Stop 3 of 9, Agent$/);
    expect(document.activeElement?.closest('[data-belt]')?.getAttribute('data-belt')).toBe('FXA-21');
  });

  it('moves the focus to the belts and says so when the focused row leaves', () => {
    load();
    render(<Belts />);
    document.querySelector<HTMLElement>('[data-belt="FXA-21"] [data-focus="row"]')!.focus();
    // A run with no sandbox moves to Needs you: a new row in another group, and the focus follows it.
    agents((a) => { a.runners.splice(1, 1); });
    expect(document.activeElement?.closest('[data-belt]')?.getAttribute('data-belt')).toBe('FXA-21');
    expect(document.activeElement?.closest('[role=group]')?.getAttribute('aria-label')).toBe('Fix it');
    act(() => store.setState((s) => {
      const full = s.feeds.full!, data = structuredClone(full.data) as J;
      data.inflight = data.inflight.filter((t: J) => t.key !== 'FXA-21');
      return { feeds: { ...s.feeds, full: { ...full, data } } };
    }));
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Belts');
    expect(document.getElementById('belts-said')!.textContent).toBe('FXA-21 left the belts.');
  });

  it('opens a row with the details region, and Watch the agent opens the terminal', () => {
    load(undefined, '#pipeline/belts/FXA-20');
    render(<Belts />);
    const row = document.querySelector('[data-belt="FXA-20"] [data-focus="row"]')!;
    expect(row.getAttribute('aria-expanded')).toBe('true');
    expect(row.getAttribute('aria-controls')).toBe('bd-FXA-20');
    expect(screen.getByRole('region', { name: 'Details of FXA-20' })).toBeTruthy();
    expect(document.querySelector('[data-belt="FXA-21"] [data-focus="row"]')!.hasAttribute('aria-controls')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Watch the agent' }));
    const det = document.getElementById('lane-term-FXA-20') as HTMLDetailsElement;
    expect(det.open).toBe(true);
    expect(document.activeElement).toBe(det.querySelector('summary'));
    expect(screen.getByRole('log', { name: /agent@sandbox: fxa-20 output/ })).toBeTruthy();
  });

  it('keeps the Outside list open across an update once a person opened it', () => {
    load();
    render(<Belts />);
    const det = document.querySelector<HTMLDetailsElement>('details.bout')!;
    det.open = true;
    fireEvent(det, new Event('toggle'));
    agents((a) => { a.runners[0].elapsed_seconds = 780; });
    expect(document.querySelector<HTMLDetailsElement>('details.bout')!.open).toBe(true);
  });
});

describe('Queue', () => {
  it('shows the queue tiles and head with held tickets apart, and no review PRs, which are on Belts', () => {
    load(undefined, '#pipeline/queue');
    render(<Queue />);
    const tile = (l: string) => document.querySelector(`[data-stat="${l}"] .text-kpi`)!.textContent;
    expect([tile('Launchable'), tile('Waits on a person')]).toEqual(['1', '1']);
    expect([...document.querySelectorAll('h2.qh')].map((h) => h.textContent)).toEqual(['Queuelabelled ai-queue21 launchable, plus 1 held']);
  });
  it('lists a skipped ticket that has a belt on Belts only, not on Queue', () => {
    load();
    const key = (beltGroups(store.getState()) as J).needs[0].t.key as string;
    const fx = rel(fixture, Date.now() / 1000);
    fx['/api/snapshot'].snapshot.queue.skipped.push({ key, summary: 'on a belt', reason: 'needs a decision', passes: 1, in_queue: true });
    load(fx, '#pipeline/queue');
    render(<Queue />);
    expect(document.querySelector('[data-stat="Waits on a person"] .text-kpi')!.textContent).toBe('1');
    expect(document.querySelector('#s-queue')!.textContent).not.toContain(key);
  });
  it('keeps a details element as a person left it across an update', () => {
    load(undefined, '#pipeline/queue');
    render(<Queue />);
    const held = document.querySelector<HTMLDetailsElement>('details[data-k=held]')!;
    expect(held.open).toBe(true);
    held.open = false;
    fireEvent(held, new Event('toggle'));
    act(() => store.setState((s) => ({ feeds: { ...s.feeds, full: { ...s.feeds.full!, ageSeconds: 5 } } })));
    expect(document.querySelector<HTMLDetailsElement>('details[data-k=held]')!.open).toBe(false);
  });
  it('says unknown, not zero, when Jira or GitHub did not answer', () => {
    const fx = rel(fixture, Date.now() / 1000);
    fx['/api/snapshot'].snapshot.queue = { fetch_failed: true };
    fx['/api/snapshot'].snapshot.review = null;
    load(fx, '#pipeline/queue');
    render(<Queue />);
    expect(screen.getByText('Jira fetch failed; unknown, not zero')).toBeTruthy();
    expect(document.querySelector('[data-stat="Launchable"] .text-kpi')!.textContent).toBe('?');
  });
});

describe('Done', () => {
  it('shows the tiles, the line and a table that sorts by column', () => {
    load(undefined, '#pipeline/done');
    render(<Done />);
    expect(document.querySelector('#dline')!.textContent).toBe('1 ticket from the last 30 merged PRs labelled bot-pr, newest first.');
    expect(document.querySelector('[data-stat="Median days to merge"] .text-kpi')!.textContent).toBe('7');
    fireEvent.click(screen.getByRole('button', { name: 'Ticket' }));
    expect(document.querySelector('.dtab th')!.getAttribute('aria-sort')).toBe('ascending');
  });
  it('says so when GitHub did not answer, or nothing merged yet', () => {
    const fx = rel(fixture, Date.now() / 1000);
    fx['/api/snapshot'].snapshot.merged_prs = null;
    load(fx, '#pipeline/done');
    const { unmount } = render(<Done />);
    expect(screen.getByText('Could not read merged PRs from GitHub.')).toBeTruthy();
    unmount();
    fx['/api/snapshot'].snapshot.merged_prs = [];
    load(fx, '#pipeline/done');
    render(<Done />);
    expect(screen.getByText('No merged ticket yet.')).toBeTruthy();
  });
});
