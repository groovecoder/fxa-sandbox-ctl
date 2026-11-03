// apply() is pure: sse.ts and poll.ts do the reads and dispatch what they get.
import type { FeedName, FeedState, Prefs, RoutineSummary, Session, Store, Viewer } from '../store/types';
import { type Bye, type Delta, type ErrorRow, type FeedFrame, type Frame, type Hello, STATS_PARTS, type StatsFrame, type Tail } from './schema';

// Not part of C2: the state that only the reducers and the data layer read.
export type Live = {
  // v1 FRESH: store rows (snapshot, deltas, /api/sessions) that the agents feed does not show yet.
  fresh: Record<string, Session>;
  epoch: string | null;
  sid: string | null;
  bye: Bye | null;
  // etag: the ETag of the stats copy; want: a frame did not apply, so read it again; buf: frames that came during a read.
  stats: { etag: string | null; want: boolean; loading: boolean; buf: StatsFrame[] };
  // `${tbl}:${key}` of the history and routine deltas, with a count, so a shown item reads its data again.
  changed: Record<string, number>;
};
export type State = Store & { live: Live };

export type Action =
  | Frame
  | { event: 'viewer'; data: Viewer }
  | { event: 'stats-loading' }
  | { event: 'stats-base'; data: { stats: Record<string, unknown>; etag: string | null } }
  | { event: 'stats-error'; data: { error: string } }
  | { event: 'rtsum'; data: { data: RoutineSummary | null; error: string } }
  | { event: 'conn'; data: Partial<Store['conn']> }
  | { event: 'tail-error'; data: { key: string } }
  | { event: 'history'; data: { key: string; rows?: Record<string, unknown>[]; error?: string } }
  | { event: 'usage'; data: { key: string; models?: Record<string, unknown>[]; error?: string } }
  | { event: 'routines'; data: { team: string; list: Record<string, unknown> } }
  | { event: 'routine-hist'; data: { id: string; runs: Record<string, unknown>[] } }
  | { event: 'memory'; data: { team: string; memory: Record<string, unknown> } };

const TAIL_MAX = 200, FLOW_MAX = 1440, BUF_MAX = 100;

export const initial = (prefs: Prefs): State => ({
  conn: { mode: 'connecting', lastEventAt: 0, seq: null },
  viewer: { user: null, admin: false, teams: [] },
  feeds: {},
  sessions: { byKey: {}, order: [] },
  tails: {}, history: {}, usage: {},
  teamsUi: { routines: {}, routineHist: {}, memory: {}, summary: { data: null, error: '', at: 0 } },
  flow: { points: [] },
  route: { view: 'overview', tab: '', sel: '', rid: '', query: {} },
  prefs,
  live: { fresh: {}, epoch: null, sid: null, bye: null, stats: { etag: null, want: false, loading: false, buf: [] }, changed: {} },
});

// The server Feed name as a store feed name.
export const feedName = (n: string): FeedName => (n === 'snapshot' ? 'full' : n.startsWith('snapshot:') ? `team:${n.slice(9)}` : (n as FeedName));

function feed(st: State, f: FeedFrame): State {
  const name = feedName(f.name), old = st.feeds[name];
  // A stats frame with no data is the age from a snapshot poll: a failed stats read keeps its error until a read works.
  const keep = name === 'stats' && !('data' in f) ? old?.error ?? null : null;
  const next: FeedState = {
    data: 'data' in f ? f.data ?? null : old?.data ?? null,
    ageSeconds: f.age_seconds, interval: f.interval, error: f.error ?? keep, refreshing: f.refreshing, fetchedAt: f.fetched_at,
  };
  const out = { ...st, feeds: { ...st.feeds, [name]: next } };
  return name === 'agents' && 'data' in f ? withSessions(out, out.live.fresh) : out;
}

// The v1 overlay; a tie goes to the store row, since a delta comes after the feed read.
function withSessions(st: State, fresh: Record<string, Session>): State {
  const fs = (st.feeds.agents?.data as { sessions?: Session[] } | null)?.sessions, hasFeed = Array.isArray(fs);
  const by = new Map((fs ?? []).map((x) => [x.key, x])), added: string[] = [], left: Record<string, Session> = {};
  let changed = false;
  for (const [k, r] of Object.entries(fresh)) {
    const x = by.get(k);
    if (r.deleted) { if (x) { by.delete(k); changed = true; } continue; }
    if (x && (x.last_activity ?? 0) > (r.last_activity ?? 0)) continue; // the feed caught up
    left[k] = r;
    by.set(k, hasFeed ? { ...x, ...r, agent: x?.agent ?? null, agent_alive: x?.agent_alive ?? false } : { ...x, ...r });
    if (!x) added.unshift(k);
    changed = true;
  }
  let order = [...added, ...[...by.keys()].filter((k) => !added.includes(k))];
  if (changed) order = order.map((k, i) => [k, i] as const).sort(([a, i], [b, j]) => ((by.get(b)?.created ?? 0) - (by.get(a)?.created ?? 0)) || i - j).map(([k]) => k);
  return { ...st, sessions: { byKey: Object.fromEntries(by), order }, live: { ...st.live, fresh: left } };
}

function delta(st: State, d: Delta): State {
  if (d.tbl === 'sessions') {
    const fresh = { ...st.live.fresh };
    for (const r of d.rows) fresh[r.key as string] = r as Session;
    for (const k of d.deleted) fresh[k] = { key: k, deleted: true };
    return withSessions(st, fresh);
  }
  if (d.tbl === 'errors') {
    // A changed signature keeps its place; a new one goes first.
    const old = (st.feeds.errors?.data as ErrorRow[] | null) ?? [], rows = d.rows as ErrorRow[];
    const kept = old.map((e) => rows.find((r) => r.sig === e.sig) ?? e).filter((e) => !d.deleted.includes(e.sig));
    const added = rows.filter((r) => !old.some((e) => e.sig === r.sig));
    const f = st.feeds.errors ?? { data: null, ageSeconds: null, interval: 0, error: null, refreshing: false, fetchedAt: null };
    return { ...st, feeds: { ...st.feeds, errors: { ...f, data: [...added, ...kept] } } };
  }
  // history and the routine tables send keys: a shown item reads its data again.
  const key = { history: 'key', routines: 'id', routine_runs: 'routine_id', routine_tick: 'env', team_audit: 'team' }[d.tbl];
  const changed = { ...st.live.changed };
  for (const k of [...d.rows.map((r) => String(r[key])), ...d.deleted]) changed[`${d.tbl}:${k}`] = (changed[`${d.tbl}:${k}`] ?? 0) + 1;
  return { ...st, live: { ...st.live, changed } };
}

// The stats rows keep their time as ms, parsed once: a render filters many thousands of rows by time.
const withMs = (rows: unknown): Record<string, unknown>[] => (Array.isArray(rows) ? rows.map((r) => ({ ...r, ms: Date.parse(r.at) })) : []);
const statsFeed = (st: State): FeedState => st.feeds.stats ?? { data: null, ageSeconds: null, interval: 0, error: null, refreshing: false, fetchedAt: null };

function stats(st: State, f: StatsFrame): State {
  const s = st.live.stats, data = statsFeed(st).data as Record<string, unknown> | null;
  if (s.loading) return { ...st, live: { ...st.live, stats: { ...s, buf: [...s.buf, f].slice(-BUF_MAX) } } };
  if (f.reload || f.base !== s.etag || !data) return { ...st, live: { ...st.live, stats: { ...s, want: true } } };
  const next: Record<string, unknown> = { ...data };
  for (const p of STATS_PARTS) if (p in f) next[p] = f[p];
  if (f.rows_add) next.rows = [...((data.rows as unknown[]) ?? []), ...withMs(f.rows_add)];
  return { ...st, feeds: { ...st.feeds, stats: { ...statsFeed(st), data: next, error: null, fetchedAt: Date.now() / 1000 } }, live: { ...st.live, stats: { ...s, etag: f.etag } } };
}

// A whole stats read. The frames that came during it apply from the first one past its ETag.
// A copy with no rows keeps none, as v1 does: a team then shows no use, not "never used".
function statsBase(st: State, stats0: Record<string, unknown>, etag: string | null): State {
  const buf = st.live.stats.buf;
  let out: State = {
    ...st,
    feeds: { ...st.feeds, stats: { ...statsFeed(st), data: { ...stats0, ...(stats0.rows === undefined ? {} : { rows: withMs(stats0.rows) }) }, error: null, fetchedAt: Date.now() / 1000 } },
    live: { ...st.live, stats: { etag, want: false, loading: false, buf: [] } },
  };
  let past = false;
  for (const f of buf) {
    if (!past) {
      if (f.etag === etag) { past = true; continue; }
      if (f.base !== etag) continue; // in the copy already
      past = true;
    }
    out = stats(out, f);
  }
  return out;
}

function tail(st: State, t: Tail): State {
  const old = st.tails[t.key]?.lines ?? [];
  const lines = [...old.slice(0, t.start), ...t.lines].slice(-TAIL_MAX);
  return { ...st, tails: { ...st.tails, [t.key]: { lines, state: 'running', at: Date.now() } } };
}

function snapshot(st: State, d: Extract<Frame, { event: 'snapshot' }>['data']): State {
  const feeds: Store['feeds'] = {};
  for (const f of Object.values(d.feeds)) {
    feeds[feedName(f.name)] = { data: f.data ?? null, ageSeconds: f.age_seconds, interval: f.interval, error: f.error, refreshing: f.refreshing, fetchedAt: f.fetched_at };
  }
  // stats is null in a snapshot: keep the stats copy, and read one when there is none.
  if (st.feeds.stats) feeds.stats = st.feeds.stats;
  feeds.errors = { data: d.errors, ageSeconds: null, interval: 0, error: null, refreshing: false, fetchedAt: Date.now() / 1000 };
  const out: State = { ...st, feeds, flow: { points: d.flow.slice(-FLOW_MAX) }, live: { ...st.live, stats: { ...st.live.stats, want: st.live.stats.want || !st.live.stats.etag } } };
  return withSessions(out, Object.fromEntries(d.sessions.map((x) => [x.key, x])));
}

export function apply(st0: State, a: Action): State {
  const st: State = 'id' in a && a.id ? { ...st0, conn: { ...st0.conn, seq: a.id, lastEventAt: Date.now() } } : st0;
  switch (a.event) {
    case 'hello': {
      const h: Hello = a.data;
      return { ...st, viewer: h.viewer, conn: { ...st.conn, mode: 'live', error: undefined, lastEventAt: Date.now() }, live: { ...st.live, epoch: h.epoch, sid: h.sid, bye: null } };
    }
    case 'snapshot': return snapshot(st, a.data);
    case 'feed': return feed(st, a.data);
    case 'delta': return delta(st, a.data);
    case 'stats': return stats(st, a.data);
    case 'tail': return tail(st, a.data);
    case 'flow': return { ...st, flow: { points: [...st.flow.points, a.data].slice(-FLOW_MAX) } };
    case 'reset': return st; // a snapshot follows
    case 'ping': return { ...st, conn: { ...st.conn, lastEventAt: Date.now() } };
    case 'bye': return { ...st, live: { ...st.live, bye: a.data } };
    case 'viewer': return { ...st, viewer: a.data };
    case 'stats-loading': return { ...st, live: { ...st.live, stats: { ...st.live.stats, loading: true, buf: [] } } };
    case 'stats-base': return statsBase(st, a.data.stats, a.data.etag);
    case 'stats-error': return { ...st, feeds: { ...st.feeds, stats: { ...statsFeed(st), error: a.data.error } }, live: { ...st.live, stats: { ...st.live.stats, loading: false, buf: [] } } };
    case 'rtsum': return { ...st, teamsUi: { ...st.teamsUi, summary: { data: a.data.data, error: a.data.error, at: Date.now() } } };
    case 'conn': return { ...st, conn: { ...st.conn, ...a.data } };
    case 'tail-error': {
      const t = st.tails[a.data.key];
      return { ...st, tails: { ...st.tails, [a.data.key]: { lines: t?.lines ?? [], state: 'error', at: Date.now() } } };
    }
    case 'history': {
      const old = st.history[a.data.key];
      return { ...st, history: { ...st.history, [a.data.key]: { rows: a.data.rows ?? old?.rows ?? [], at: Date.now(), ...(a.data.error ? { error: a.data.error } : {}) } } };
    }
    case 'usage': {
      const old = st.usage[a.data.key];
      return { ...st, usage: { ...st.usage, [a.data.key]: { models: a.data.models ?? old?.models ?? [], at: Date.now(), ...(a.data.error ? { error: a.data.error } : {}) } } };
    }
    case 'routines': return { ...st, teamsUi: { ...st.teamsUi, routines: { ...st.teamsUi.routines, [a.data.team]: a.data.list } } };
    case 'routine-hist': return { ...st, teamsUi: { ...st.teamsUi, routineHist: { ...st.teamsUi.routineHist, [a.data.id]: a.data.runs } } };
    case 'memory': return { ...st, teamsUi: { ...st.teamsUi, memory: { ...st.teamsUi.memory, [a.data.team]: a.data.memory } } };
  }
}
