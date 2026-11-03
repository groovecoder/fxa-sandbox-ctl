// Each poll answer becomes a stream action (feed, delta), so the reducers have one input format.
import type { Viewer } from '../store/types';
import { type Got, getJson, latest } from './api';
import type { Action, State } from './reducers';
import type { FeedFrame } from './schema';

export type Env = { dispatch: (a: Action) => void; getState: () => State; tails: () => string[] };

const feed = (name: string, data: unknown, age: unknown, interval: unknown, error: unknown, refreshing = false, withData = true): Action => {
  const a = typeof age === 'number' ? age : null;
  const f: FeedFrame = { name, age_seconds: a, interval: typeof interval === 'number' ? interval : 0, error: typeof error === 'string' && error ? error : null,
    refreshing: !!refreshing, fetched_at: a == null ? null : Math.round(Date.now() / 1000 - a) };
  return { event: 'feed', data: withData ? { ...f, data: data ?? null } : f };
};

// /api/snapshot: the tickets, agents and team feeds, and the age of the stats feed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the v1 snapshot is loose JSON
export function snapshotActions(j: any): Action[] {
  const out = [feed('snapshot', j.snapshot, j.age_seconds, j.interval, j.error, j.refreshing),
    feed('agents', j.agents, j.agents_age_seconds, j.agents_interval, j.agents_error),
    feed('stats', null, j.stats_age_seconds, j.stats_interval, j.stats_error, false, false)];
  for (const [t, x] of Object.entries(j.teams ?? {})) {
    const v = x as { snapshot?: unknown; error?: string; age_seconds?: number };
    out.push(feed(`snapshot:${t}`, v?.snapshot, v?.age_seconds, j.interval, v?.error));
  }
  return out;
}
// /api/sessions?since=: the rows written since the cursor; a {key, deleted} row is a delete.
export function sessionsAction(j: { rows?: Record<string, unknown>[] }): Action {
  const rows = j.rows ?? [];
  return { event: 'delta', data: { tbl: 'sessions', rows: rows.filter((r) => !r.deleted), deleted: rows.filter((r) => r.deleted).map((r) => String(r.key)) } };
}
// A failed read keeps the last list and says why.
export const errorsAction = (got: Got): Action => ('data' in got && Array.isArray(got.data)
  ? feed('errors', got.data, 0, 15, null)
  : feed('errors', null, null, 15, 'error' in got ? got.error : (got.data as { error?: string } | null)?.error || 'the answer is not a list', false, false));
export const teamsAction = (got: Got<{ teams?: unknown[]; age_seconds?: number; error?: string }>): Action => ('data' in got
  ? feed('teams', got.data.teams ?? [], got.data.age_seconds ?? 0, 300, got.data.error)
  : feed('teams', null, null, 300, `the teams read failed (${got.error})`, false, false));
export const viewerAction = (got: Got<{ user?: string; admin?: boolean; teams?: string[] }>): Action => {
  const v: Viewer = 'data' in got ? { user: got.data.user ?? null, admin: !!got.data.admin, teams: got.data.teams ?? [] } : { user: null, admin: false, teams: [] };
  return { event: 'viewer', data: v };
};

// The stats copy: /api/stats?inproc=1 for the stream (its frames apply to it), /api/stats when polling.
export async function loadStats(env: Env, url: string): Promise<void> {
  env.dispatch({ event: 'stats-loading' });
  const got = await getJson<Record<string, unknown>>(url);
  if ('data' in got && got.data && !got.data.error) env.dispatch({ event: 'stats-base', data: { stats: got.data, etag: got.etag } });
  else env.dispatch({ event: 'stats-error', data: { error: `the stats feed could not be read (${'error' in got ? got.error : got.data?.error})` } });
}

// The routines summary is for an admin only.
export async function loadSummary(env: Env): Promise<void> {
  if (!env.getState().viewer.admin) return;
  const got = await latest<{ teams?: Record<string, never> }>('rtsum', '/api/routines/summary');
  if (!got) return;
  env.dispatch({ event: 'rtsum', data: 'data' in got && got.data?.teams ? { data: got.data as never, error: '' } : { data: null, error: 'error' in got ? got.error : 'the dashboard did not answer' } });
}

export async function pollSnapshot(env: Env): Promise<void> {
  const [snap, teams, admin] = await Promise.all([latest('snapshot', '/api/snapshot'), latest('teams', '/api/teams'), latest('team-admin', '/api/team-admin')]);
  if (admin) env.dispatch(viewerAction(admin as Got<never>));
  if (teams) env.dispatch(teamsAction(teams as Got<never>));
  if (snap && 'data' in snap) for (const a of snapshotActions(snap.data)) env.dispatch(a);
  await loadSummary(env);
}

let cursor: unknown = null;
export async function pollSessions(env: Env): Promise<void> {
  const got = await latest<{ rows?: Record<string, unknown>[]; cursor?: unknown }>('sessions', `/api/sessions${cursor == null ? '' : `?since=${encodeURIComponent(String(cursor))}`}`);
  if (!got || !('data' in got) || got.data.cursor == null) return;
  cursor = got.data.cursor;
  env.dispatch(sessionsAction(got.data));
}
export async function pollErrors(env: Env): Promise<void> { const got = await latest('errors', '/api/errors'); if (got) env.dispatch(errorsAction(got)); }
export async function pollTails(env: Env): Promise<void> {
  for (const key of env.tails()) {
    const got = await latest<{ lines?: string[] }>(`tail:${key}`, `/api/tail?key=${encodeURIComponent(key)}`);
    if (!got) continue;
    env.dispatch('data' in got && Array.isArray(got.data.lines) ? { event: 'tail', data: { key, start: 0, lines: got.data.lines } } : { event: 'tail-error', data: { key } });
  }
}

// Starts the polls; the returned function stops them. A hidden tab polls nothing and catches up when it shows.
export function startPoller(env: Env): () => void {
  const hidden = () => typeof document !== 'undefined' && document.hidden;
  const every = (ms: number, f: (e: Env) => Promise<void>) => { void f(env); return setInterval(() => { if (!hidden()) void f(env); }, ms); };
  const ids = [every(15000, pollSnapshot), every(3000, pollSessions), every(15000, pollErrors), every(60000, (e) => loadStats(e, '/api/stats')), every(5000, pollTails)];
  return () => ids.forEach(clearInterval);
}
