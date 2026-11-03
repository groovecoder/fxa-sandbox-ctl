// The Sandboxes view logic on the v1 page fixtures, with the numbers of the v1 checks (page-sb.check.sh, page.check.sh).
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { snapshotActions, teamsAction, viewerAction } from '../../live/poll';
import { type Action, type State, apply, initial } from '../../live/reducers';
import { sbRows, slotList } from '../../model/floor';
import { SF_DEFAULT } from '../../store/prefs';
import { doneRows, freeLine, hostHours, runBadge, sbCards, selRow, slotGrid, statsNote, timelineRows } from './model';

type J = ReturnType<typeof JSON.parse>;
const NOW = Math.floor(Date.now() / 1000);
function rel(v: J): J {
  if (Array.isArray(v)) return v.map(rel);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rel(x)]));
  const m = typeof v === 'string' ? v.match(/^@(iso|epoch)([+-]\d+)$/) : null;
  return !m ? v : m[1] === 'epoch' ? NOW + Number(m[2]) : new Date((NOW + Number(m[2])) * 1000).toISOString();
}
const fixture = (n: string) => rel(JSON.parse(readFileSync(new URL(`../../../../skills/fxa-ctl-dev/page-fixture-${n}.json`, import.meta.url), 'utf8')));
// The store as the poller builds it; edit changes the fixture first, as a v1 check edits AGENTS.
function storeOf(n: string, edit: (fx: J) => void = () => {}): State {
  const fx = fixture(n);
  edit(fx);
  let st = initial({ theme: 'system', keys: false, pipeTeam: '', sowner: '', panelW: {}, noside: false, noright: false, sx: { term: true }, statsFilter: SF_DEFAULT });
  const d = (a: Action) => { st = apply(st, a); };
  d(viewerAction({ data: fx['/api/team-admin'] ?? {}, etag: null }));
  if (fx['/api/teams']) d(teamsAction({ data: fx['/api/teams'], etag: null }));
  snapshotActions(fx['/api/snapshot']).forEach(d);
  if (fx['/api/stats'] !== undefined) d(fx['/api/stats'] ? { event: 'stats-base', data: { stats: fx['/api/stats'], etag: null } } : { event: 'stats-error', data: { error: 'stats read failed' } });
  return st;
}

describe('the cards', () => {
  test('7 day runs and sessions, the cost lines and the host state', () => {
    const iso = (s: number) => new Date((NOW - s) * 1000).toISOString();
    const st = storeOf('sb-cards', (fx) => {
      const rows: J[] = [];
      for (let i = 0; i < 41; i++) rows.push({ at: iso(3600 * (i + 1)), src: 'pipeline', key: 'EX-' + i, min: i ? 92 : 100, profile: 'example' });
      const sl = (i: number, o: J) => ({ at: iso(3600 * (i + 1)), src: 'slack', key: 'agent-s' + i, profile: 'example', backend: null, t0: null, end: null, boot_s: null, ...o });
      for (let i = 0; i < 20; i++) rows.push(sl(i, i === 0 ? { boot_s: 30 } : i === 1 ? { boot_s: 41 } : i === 2 ? { boot_s: 60 } : {}));
      rows.push(sl(20, { backend: 'firecracker', t0: NOW - 36000, end: NOW - 28800 }), sl(21, { backend: 'firecracker', t0: NOW - 32400, end: NOW - 25200 }),
        sl(22, { backend: 'gce', t0: NOW - 18000, end: NOW - 14400 }), { at: iso(9 * 86400), src: 'pipeline', key: 'EX-OLD', min: 500 });
      fx['/api/stats'] = { rows, load: { cap: 4, days: [{ day: new Date().toISOString().slice(0, 10), peak: 3 }] } };
    });
    const c = sbCards(st, NOW) as J;
    expect(c.pipe.line).toBe('7 days: 41 runs, 63 h');
    expect(c.pipe.segs).toHaveLength(5);
    expect(c.pipe.segs[0]).toEqual({ cls: 'busy', title: 'ex-auto-1: EX-101' });
    expect(c.sess.line).toBe('7 days: 23 sessions, peak 3 of 4 · boot median 41 s');
    expect(c.cost.manager).toBe('$0.21/h · $35 in 7 days, always on');
    expect(c.cost.host).toBe('stopped: it starts for the next session');
    expect(c.cost.hostUse).toBe('Sessions used the host 3 h in 7 days');
    expect(c.cost.gceNow).toBe('$0.13/h');
  });
  test('a GCE session is hatched; fc_state none hides the host', () => {
    const c = sbCards(storeOf('sb-cards', (fx) => {
      fx['/api/snapshot'].agents.sessions.push({ key: 'agent-ex0002', state: 'active', boot_backend: 'gce', created: NOW - 60 });
      fx['/api/snapshot'].agents.infra.fc_state = 'none';
    }), NOW) as J;
    expect([c.sess.busy, c.sess.gce, c.sess.segs.filter((x: J) => x.cls === 'busy gce').length, c.sess.host, c.cost.host]).toEqual([2, 1, 1, null, null]);
  });
  test('a failed stats read says unknown, never 0; before the first read it says Loading', () => {
    const e = sbCards(storeOf('sb-cards', (fx) => { fx['/api/stats'] = null; }), NOW) as J;
    expect(e.pipe.line).toBe('7 days: unknown: Stats read failed. The next poll tries again');
    expect(e.cost.hostUse).toMatch(/^unknown: /);
    expect((sbCards(storeOf('sb-cards', (fx) => { delete fx['/api/stats']; }), NOW) as J).pipe.line).toBe('7 days: Loading the stats…');
  });
  test('an old agents feed gives ? on each card', () => {
    const c = sbCards(storeOf('sb-cards', (fx) => { fx['/api/snapshot'].agents_age_seconds = 99999; }), NOW);
    expect([c.pipe.unknown, c.sess.unknown, c.cost.unknown]).toEqual([true, true, true]);
  });
  test('the host hours: parallel sessions count once, an open row that is not live counts nothing', () => {
    const r = (t0: number, end: number | null, live = false) => ({ src: 'slack', backend: 'firecracker', t0, end, live });
    expect(hostHours([r(NOW - 7200, NOW - 3600), r(NOW - 5400, NOW - 1800)], NOW - 86400, NOW)).toBeCloseTo(1.5);
    expect(hostHours([r(NOW - 3 * 86400, null)], NOW - 7 * 86400, NOW)).toBe(0);
    expect(hostHours([r(NOW - 3600, null, true)], NOW - 86400, NOW)).toBeCloseTo(1);
  });
  test('statsNote: an old stats feed', () => {
    const st = storeOf('sandboxes');
    st.feeds.stats = { ...st.feeds.stats!, ageSeconds: 600, interval: 60, error: null };
    expect(statsNote(st, NOW)).toBe('The stats feed is 10 min old.');
  });
});

describe('the list, the slots and the panel', () => {
  test('the free line names free and held slots and the free session slots', () => {
    const r = sbRows(storeOf('sandboxes'));
    expect(freeLine(r, 'all', slotList)).toBe('ex-auto-3 · held for a run in flight: ex-auto-5 (EX-103) · 2 session slots');
    expect(freeLine(r, 'slack', slotList)).toBe('2 session slots');
    expect(freeLine({ ...r, stale: true }, 'all', slotList)).toBe('');
  });
  test('the slot grid: running, free, fix and held slots; a GCE session slot', () => {
    const g = slotGrid(storeOf('sandboxes'));
    expect(g.pool!.map((t) => `${t.name}:${t.word}`)).toEqual(['ex-auto-1:running', 'ex-auto-2:running', 'ex-auto-3:free', 'ex-auto-4:fix', 'ex-auto-5:held']);
    expect(g.sess!.map((t) => `${t.word}${t.gce ? ' gce' : ''}`)).toEqual(['running', 'running gce', 'free', 'free']);
    expect(slotGrid(storeOf('sandboxes', (fx) => { fx['/api/snapshot'].agents_error = 'boom'; }))).toEqual({ pool: null, sess: null });
  });
  test('a selection: the row, gone when a known list drops it, unknown when the feed failed', () => {
    const st = storeOf('sandboxes');
    expect(selRow(st, 'sess:agent-ex0001', 'all')).toHaveProperty('row.key', 'agent-ex0001');
    expect(selRow(st, 'sess:agent-ex0001', 'pipeline')).toBe('gone');
    expect(selRow(st, 'sess:nope', 'all')).toBe('gone');
    expect(selRow(storeOf('sandboxes', (fx) => { fx['/api/snapshot'].agents_error = 'boom'; }), 'sess:agent-ex0001', 'all')).toBe('unknown');
  });
  test('the timeline: a start per row, the cap from the start, a fix row has no cap', () => {
    const rows = [{ id: 'a', src: 'slack', key: 'agent-a1', started: NOW - 600, cap: 5400, state: 'working' }, { id: 'b', src: 'pipeline', key: 'EX-1', age: 60, cap: 5400, state: 'Stop 2 of 9, Boot' },
      { id: 'c', src: 'slack', key: 'agent-c1', age: 900, fix: { why: 'x' }, state: 'stopped' }, { id: 'd', src: 'pipeline', key: 'EX-2', state: 'not free', fix: {} }];
    expect(timelineRows(rows, true, NOW)).toEqual([
      { id: 'a', label: 'Slack agent-a1', t0: NOW - 600, cap: NOW + 4800, fix: false, state: 'working' },
      { id: 'b', label: 'Pipeline EX-1', t0: NOW - 60, cap: NOW + 5340, fix: false, state: 'Stop 2 of 9, Boot' },
      { id: 'c', label: 'Slack agent-c1', t0: NOW - 900, cap: null, fix: true, state: 'needs a fix' }]);
  });
});

describe('Recently completed', () => {
  test('the result tag and the tab filter, at most 20 rows', () => {
    expect(runBadge({ outcome: 'pr', pr_number: 41, pr_state: 'merged', pr_url: 'https://github.com/example/repo/pull/41' })).toEqual({ label: 'PR #41 merged', tone: 'ok', href: 'https://github.com/example/repo/pull/41' });
    expect(runBadge({ outcome: 'pr', pr_url: 'javascript:alert(1)' })).toEqual({ label: 'PR', tone: 'info', href: '' });
    expect(runBadge({ outcome: 'failed' })).toEqual({ label: 'failed', tone: 'bad' });
    const runs = [{ src: 'slack', key: 'a' }, { src: 'slack', key: '', routine: true }, { src: 'pipeline', key: 'EX-1' }];
    expect(doneRows(runs, 'pipeline').map((r) => r.key)).toEqual(['EX-1']);
    expect(doneRows(runs, 'routines')).toHaveLength(1);
    expect(doneRows(Array.from({ length: 25 }, (_, i) => ({ src: 'slack', key: `k${i}` })), 'all')).toHaveLength(20);
  });
});

