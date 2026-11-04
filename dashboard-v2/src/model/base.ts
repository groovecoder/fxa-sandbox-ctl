// The store read as the v1 globals (AGENTS, STATE, STATS...), so each port keeps the v1 code line for line.
import type { Session, Store } from '../store/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the feeds are loose JSON; the golden tests pin each result
export type J = any;

// One result per change of its inputs, for all callers: deps names the store slices that f reads.
export function memo<R>(deps: (s: Store) => unknown[], f: (s: Store) => R): (s: Store) => R {
  let last: unknown[] | null = null, out: R;
  return (s) => {
    const d = deps(s);
    if (!last || d.length !== last.length || d.some((x, i) => x !== last![i])) { out = f(s); last = d; }
    return out;
  };
}

export const LANE_ST = ['Queue', 'Boot', 'Agent', 'Squash', 'Push', 'PR', 'CI', 'Review', 'Merged'];
export const KEY_RE = /^[A-Z][A-Z0-9]+-\d+$/;
export const BELT_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
export const TEAM_RE = /^[a-z][a-z0-9-]{1,30}$/;
export const LIVE_SESSION = ['starting', 'active', 'wrapping'];
export const PIPE_LISTS = ['inflight', 'review', 'blocked', 'open_prs', 'merged_prs'];

// The v1 STATE: the snapshot top level, from the full, agents and stats feeds.
// Its deps are the fields themselves, so a new stats copy or an errors delta keeps the same STATE.
export const STATE = memo((s) => [s.feeds.full, s.feeds.agents, s.feeds.stats].flatMap((f) => [f?.ageSeconds, f?.interval, f?.error, f?.refreshing]), (s): J => {
  const f = s.feeds.full, a = s.feeds.agents, st = s.feeds.stats;
  return {
    age_seconds: f?.ageSeconds, interval: f?.interval, error: f?.error, refreshing: f?.refreshing,
    agents_age_seconds: a?.ageSeconds, agents_interval: a?.interval, agents_error: a?.error,
    stats_age_seconds: st?.ageSeconds, stats_interval: st?.interval, stats_error: st?.error,
  };
});

// The merged session list (v1 AGENTS.sessions after overlay), newest first.
export const SS = memo((s) => [s.sessions], (s): Session[] => s.sessions.order.map((k) => s.sessions.byKey[k]).filter((x): x is Session => !!x));

// v1 AGENTS: the agents feed, with its sessions from the store.
export const AGENTS = memo((s) => [s.feeds.agents, s.sessions], (s): J => {
  const d = s.feeds.agents?.data;
  return d && typeof d === 'object' ? { ...(d as object), sessions: SS(s) } : null;
});

export const STATS = (s: Store): J => s.feeds.stats?.data ?? null;
export const ERRS = (s: Store): J[] | null => (Array.isArray(s.feeds.errors?.data) ? (s.feeds.errors.data as J[]) : null);
// v1 TEAMS: {teams, error, age_seconds}, or null before the first read.
export const TEAMS = memo((s) => [s.feeds.teams], (s): J => {
  const f = s.feeds.teams;
  return f ? { teams: Array.isArray(f.data) ? f.data : [], error: f.error, age_seconds: f.ageSeconds } : null;
});
export const TEAM_ADMIN = (s: Store) => s.viewer;
export const RTSUM = (s: Store) => s.teamsUi.summary.data;

export const isAdmin = (s: Store) => !!s.viewer.admin;
