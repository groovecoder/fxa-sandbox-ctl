// The hash router: #view/tab/sel/rid?query. parse keeps the v1 route() rules; format writes the canonical hash.
import { viewOf } from '../app/views';
import type { QueryKey, Route, ViewId } from './types';

export const KEY_RE = /^[A-Z][A-Z0-9]+-\d+$/;
export const BELT_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
export const SESSION_RE = /^agent-[a-z0-9]{4,12}$/;
export const TEAM_RE = /^[a-z][a-z0-9-]{1,30}$/;
export const TEAM_TABS = ['overview', 'routines', 'memory', 'settings'] as const;
const QUERY_KEYS: QueryKey[] = ['range', 'metric', 'src'];

const dec = (s: string | undefined) => {
  try {
    return decodeURIComponent(s ?? '');
  } catch {
    return '';
  }
};

export const HOME: Route = { view: 'overview', tab: '', sel: '', rid: '', query: {} };

// prev gives the v1 rule that an unknown tab keeps the current tab of the same view.
export function parse(hash: string, prev: Route = HOME): Route {
  const [path = '', qs = ''] = hash.replace(/^#/, '').split('?');
  const [v = '', sub = '', sel = '', rid = ''] = path.split('/');
  const params = new URLSearchParams(qs);
  const query: Route['query'] = {};
  for (const k of QUERY_KEYS) if (params.has(k)) query[k] = params.get(k)!;
  if (v === 'pipeline' && sub === 'board') {
    const k = dec(sel);
    return { view: 'pipeline', tab: 'belts', sel: KEY_RE.test(k) ? k : '', rid: '', query };
  }
  if (v === 'teams') {
    if (sub === 'routines' && TEAM_RE.test(sel)) return { view: 'teams', tab: 'routines', sel, rid: '', query };
    const team = sub === 'all' || sub === 'routines' || !(TEAM_RE.test(sub) || sub === 'new') ? '' : sub;
    const tab = (TEAM_TABS as readonly string[]).includes(sel) && team ? sel : 'overview';
    return { view: 'teams', tab, sel: team, rid: tab === 'routines' && /^[1-9][0-9]*$/.test(rid) ? rid : '', query };
  }
  const def = viewOf(v);
  const has = (t: string) => def.tabs.some((x) => x.id === t);
  const tab = has(sub) ? sub : def.id === prev.view && has(prev.tab) ? prev.tab : (def.tabs[0]?.id ?? '');
  let s = dec(sel);
  if (def.id === 'pipeline' && !BELT_KEY_RE.test(s)) s = '';
  if (def.id === 'sessions' && !SESSION_RE.test(s)) s = '';
  if (def.id === 'overview' || def.id === 'stats') s = '';
  return { view: def.id, tab, sel: s, rid: '', query };
}

export function format(r: Route): string {
  const parts: string[] =
    r.view === 'teams'
      ? ['teams', r.sel, r.sel && (r.tab !== 'overview' || r.rid) ? r.tab : '', r.sel && r.tab === 'routines' ? r.rid : '']
      : [r.view, r.tab, r.sel ? encodeURIComponent(r.sel) : ''];
  while (parts.length > 1 && !parts[parts.length - 1]) parts.pop();
  const q = new URLSearchParams();
  for (const k of QUERY_KEYS) if (r.query[k]) q.set(k, r.query[k]!);
  return `#${parts.join('/')}${q.size ? `?${q}` : ''}`;
}

// The hash of a view's tab, as a rail link or the 1-7 keys go.
export const viewHash = (view: ViewId, tab = '') => format({ ...HOME, view, tab: tab || (viewOf(view).tabs[0]?.id ?? '') });

export const LIVE_STATES = ['starting', 'active', 'wrapping'];
export const SESS_STATES: Record<string, string[]> = {
  live: LIVE_STATES,
  paused: ['paused'],
  stopped: ['stopped', 'failed', 'pr_open'],
};
export const sessTabOf = (state?: string) =>
  state === 'paused' ? 'paused' : LIVE_STATES.includes(state ?? '') ? 'live' : 'stopped';

// #sessions with no tab: the first of live, paused, stopped that has a row.
export const firstSessTab = (states: (string | undefined)[]) =>
  ['live', 'paused', 'stopped'].find((t) => states.some((s) => SESS_STATES[t]!.includes(s ?? ''))) ?? 'live';

// A pipeline link whose key fails BELT_KEY_RE: the view says "That link names no ticket." and never echoes it.
export const badPipeLink = (hash: string) => {
  const [v, sub, sel] = hash.replace(/^#/, '').split('?')[0]!.split('/');
  return v === 'pipeline' && sub !== 'board' && !!sel && !BELT_KEY_RE.test(dec(sel));
};
