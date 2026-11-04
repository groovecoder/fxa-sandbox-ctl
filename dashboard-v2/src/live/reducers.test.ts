// A replay of each fixtures/live/*.ndjson through the reducers ends in the state the fixture describes.
import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { SF_DEFAULT } from '../store/prefs';
import { type Action, type State, apply, initial } from './reducers';
import { type Frame, parseFrame } from './schema';

const dir = new URL('../../fixtures/live/', import.meta.url);
const NOW = 1793750400;
const ETAG = (n: number) => `"${(0xa11ce000 + n).toString(16).padStart(20, '0')}"`;
const frames = (name: string): Frame[] => readFileSync(new URL(`${name}.ndjson`, dir), 'utf8').split('\n').filter(Boolean).map(parseFrame);
const start = () => initial({ theme: 'system', keys: false, pipeTeam: '', sowner: '', panelW: {}, noside: false, noright: false, sx: { term: true }, statsFilter: SF_DEFAULT });
const run = (xs: Action[], st: State = start()) => xs.reduce(apply, st);
const sess = (st: State, k: string) => st.sessions.byKey[k] as Record<string, unknown> | undefined;
const lastId = (xs: Frame[]) => [...xs].reverse().find((f) => f.id)?.id;
const sorted = (st: State) => st.sessions.order.every((k, i, a) => i === 0 || ((st.sessions.byKey[a[i - 1]!]?.created ?? 0) >= (st.sessions.byKey[k]?.created ?? 0)));

test('every fixture replays, the seq is the last ring id, and a session delta sorts the list newest first', () => {
  const names = readdirSync(dir).filter((f) => f.endsWith('.ndjson')).map((f) => f.replace(/\.ndjson$/, ''));
  expect(names.length).toBeGreaterThanOrEqual(6);
  for (const n of names) {
    const xs = frames(n), st = run(xs);
    expect(st.conn.seq, n).toBe(lastId(xs));
    // With no newer row, the list keeps the feed order, as v1 does.
    expect(sorted(st) || !xs.some((f) => f.event === 'delta' && f.data.tbl === 'sessions'), n).toBe(true);
    expect(st.sessions.order.length, n).toBe(Object.keys(st.sessions.byKey).length);
  }
});

test('basic: each delta table and each event applies', () => {
  const st = run(frames('basic'));
  expect(st.viewer).toEqual({ user: 'user@example.com', admin: true, teams: ['example'] });
  expect(st.sessions.order).toEqual(['agent-ex0002', 'agent-ex0001', 'agent-ex0003']);
  expect(sess(st, 'agent-ex0002')).toMatchObject({ turns: 3, last_activity: NOW + 5, agent_alive: true });
  expect(st.tails['agent-ex0001']?.lines).toEqual(['Reading the sample page.', 'Running the sample tests.', 'All sample tests pass.']);
  // A feed frame with no data changes the age and keeps the data.
  expect(st.feeds.agents).toMatchObject({ ageSeconds: 2, interval: 30 });
  expect((st.feeds.agents?.data as { runners: unknown[] }).runners.length).toBeGreaterThan(0);
  const errs = st.feeds.errors?.data as { sig: string; status: string }[];
  expect(errs.find((e) => e.sig === 'a1b2c3d4e5')?.status).toBe('resolved');
  expect(errs).toHaveLength(2);
  expect(st.live.changed).toEqual({ 'history:agent-ex0001': 1, 'routines:1': 1, 'routines:7': 1, 'routine_runs:1': 1, 'routine_tick:live': 1, 'team_audit:example': 1 });
  expect(st.flow.points.map((p) => p.at)).toEqual([NOW - 120, NOW - 60, NOW, NOW + 60]);
  expect(Object.keys(st.feeds).sort()).toEqual(['agents', 'errors', 'full', 'teams']);
  expect(st.live.bye).toEqual({ reason: 'max_life' });
  // The snapshot has no stats: the client reads them once.
  expect(st.live.stats.want).toBe(true);
});

test('resume: a replay on the same epoch keeps the state; a new epoch gives a fresh snapshot', () => {
  const xs = frames('resume'), mid = run(xs.slice(0, 8));
  expect(mid.feeds.full).toMatchObject({ error: 'RuntimeError: sample Jira timeout', ageSeconds: 1 });
  expect(mid.feeds.full?.data).not.toBeNull();
  expect(sess(mid, 'agent-ex0001')?.turns).toBe(6);
  expect(mid.tails['agent-ex0001']?.lines).toEqual(['Reading the sample page.', 'Running the sample tests.']);
  const st = run(xs);
  expect(st.live.epoch).toBe('e7b29d41');
  expect(st.live.bye).toBeNull();
  expect(st.feeds.full?.error).toBeNull();
  expect(sess(st, 'agent-ex0001')?.turns).toBe(7);
  expect(sess(st, 'agent-ex0002')).toMatchObject({ state: 'stopped', stopped_at: NOW + 40 });
  expect(st.tails['agent-ex0001']?.lines).toHaveLength(2);
});

test('reset: the snapshot after a reset wins over the deltas before it', () => {
  const st = run(frames('reset'));
  expect(sess(st, 'agent-ex0001')).toMatchObject({ turns: 20, last_activity: NOW + 50 });
  expect(sess(st, 'agent-ex0002')?.last_activity).toBe(NOW + 51);
  // The agents feed still lists the other sessions (the v1 merge rule removes a session only on a delete).
  expect(st.sessions.order).toContain('agent-ex0004');
});

test('private-team: a viewer who is not an admin gets counts only, and the redacted fields stay out', () => {
  const st = run(frames('private-team'));
  expect(st.viewer.admin).toBe(false);
  expect(st.feeds['team:example']?.data).toMatchObject({ redacted: true, counts: { ready: 3 } });
  expect(sess(st, 'agent-ex0002')).toMatchObject({ turns: 8, profile: 'example' });
  expect(sess(st, 'agent-ex0002')).not.toHaveProperty('request');
  expect(sess(st, 'agent-ex0003')).toMatchObject({ fix_run: true });
  expect(sess(st, 'agent-ex0003')).not.toHaveProperty('fix_pr');
});

test('big-burst: 12 deltas of 50 rows and the tail batches end in one list', () => {
  const st = run(frames('big-burst'));
  const bb = st.sessions.order.filter((k) => k.startsWith('agent-bb'));
  expect(bb).toHaveLength(40);
  expect(bb.every((k) => sess(st, k)?.state === 'stopped' && sess(st, k)?.turns === 11)).toBe(true);
  expect(st.sessions.order).not.toContain('agent-bb0000');
  expect(st.tails['agent-ex0001']?.lines).toEqual(Array.from({ length: 60 }, (_, i) => `sample line ${i}`));
});

test('stats-parts: frames apply by base and etag, during a read too; a gap or a reload asks for a new read', () => {
  const xs = frames('stats-parts'), copy = { rows: [{ at: '2026-11-03T00:00:00Z', src: 'pipeline', key: 'EX-1', usd: 1 }], prs: [], llm: {} };
  const base: Action = { event: 'stats-base', data: { stats: copy, etag: ETAG(1) } };
  const check = (st: State) => {
    const d = st.feeds.stats?.data as Record<string, unknown>;
    expect((d.rows as { key: string; ms: number }[]).map((r) => r.key)).toEqual(['EX-1', 'EX-900', 'EX-901']);
    expect((d.rows as { ms: number }[]).every((r) => typeof r.ms === 'number')).toBe(true);
    expect(d.prs).toHaveLength(2);
    expect(d).toHaveProperty('pipeline');
    expect(d).toHaveProperty('load');
    expect(st.live.stats.etag).toBe(ETAG(4));
    // ETAG(9) is not the client's copy, and a reload is a past row: both ask for a whole read.
    expect(st.live.stats.want).toBe(true);
  };
  // The read answers before the frames.
  check(run(xs.slice(2), run([...xs.slice(0, 2), base])));
  // The read answers after the frames: they wait in the buffer, then apply from the copy's ETAG.
  check(run([base], run(xs.slice(2), run([...xs.slice(0, 2), { event: 'stats-loading' }]))));
  // A frame with no copy to apply to only asks for a read.
  const none = run(xs);
  expect(none.feeds.stats).toBeUndefined();
  expect(none.live.stats.want).toBe(true);
  // A copy newer than some buffered frames: the frames up to its ETAG are in it already.
  const late = run([{ event: 'stats-base', data: { stats: copy, etag: ETAG(3) } }], run(xs.slice(2), run([...xs.slice(0, 2), { event: 'stats-loading' }])));
  expect(late.live.stats.etag).toBe(ETAG(4));
  expect((late.feeds.stats?.data as { rows: unknown[] }).rows).toHaveLength(1);
});

test('an agents feed read that is older than a delta keeps the delta row; a newer one wins', () => {
  const xs = frames('basic'), st = run(xs.slice(0, 3));
  const feed = st.feeds.agents!, data = feed.data as { sessions: Record<string, unknown>[] };
  const withRow = (la: number, turns: number): Action => ({ event: 'feed', data: { name: 'agents', age_seconds: 0, interval: 30, error: null, refreshing: false, fetched_at: NOW,
    data: { ...data, sessions: data.sessions.map((x) => (x.key === 'agent-ex0002' ? { ...x, last_activity: la, turns, agent_alive: false } : x)) } } });
  const older = apply(st, withRow(NOW, 1));
  expect(sess(older, 'agent-ex0002')).toMatchObject({ turns: 3, agent_alive: false });
  const newer = apply(older, withRow(NOW + 9, 9));
  expect(sess(newer, 'agent-ex0002')?.turns).toBe(9);
  expect(newer.live.fresh['agent-ex0002']).toBeUndefined();
});

test('a failed stats read keeps its error when the next snapshot poll brings only the stats age', () => {
  const age: Action = { event: 'feed', data: { name: 'stats', age_seconds: 10, interval: 60, error: null, refreshing: false, fetched_at: NOW } };
  const failed = run([{ event: 'stats-loading' }, { event: 'stats-error', data: { error: 'the stats feed could not be read (HTTP 502)' } }, age]);
  expect(failed.feeds.stats?.error).toBe('the stats feed could not be read (HTTP 502)');
  const ok = run([{ event: 'stats-base', data: { stats: { rows: [] }, etag: null } }, age], failed);
  expect(ok.feeds.stats?.error).toBeNull();
});

test('a stats copy with no rows keeps no rows, as v1 does', () => {
  const st = run([{ event: 'stats-base', data: { stats: {}, etag: null } }]);
  expect(st.feeds.stats?.data).toEqual({});
  expect((run([{ event: 'stats-base', data: { stats: { rows: [{ at: '2026-11-03T00:00:00Z' }] }, etag: null } }]).feeds.stats?.data as { rows: { ms: number }[] }).rows[0]?.ms).toBe(Date.parse('2026-11-03T00:00:00Z'));
});

test('a store row equal to the feed row keeps the feed order; a newer one sorts newest first', () => {
  const [hello, snap] = frames('basic') as [Frame, Frame & { event: 'snapshot' }];
  const st = run([hello, snap]);
  expect(st.sessions.order).toEqual(['agent-ex0001', 'agent-ex0002', 'agent-ex0003', 'agent-ex0004']);
  const row = { ...snap.data.sessions.find((s) => s.key === 'agent-ex0001')!, last_activity: NOW + 60 };
  const next = apply(st, { event: 'delta', id: 'e5a17c0d-99', data: { tbl: 'sessions', rows: [row], deleted: [] } } as Frame);
  expect(next.sessions.order).toEqual(['agent-ex0002', 'agent-ex0001', 'agent-ex0003', 'agent-ex0004']);
});
