// One EventSource per tab; on failure it polls, probes the sign-in, or waits offline.
import type { Store } from '../store/types';
import { getJson, postJson } from './api';
import { type Env, loadStats, loadSummary, startPoller } from './poll';
import { type EventName, isFrame } from './schema';

const EVENTS: EventName[] = ['hello', 'snapshot', 'feed', 'delta', 'stats', 'tail', 'flow', 'reset', 'ping', 'bye'];
const RING = new Set<EventName>(['snapshot', 'feed', 'delta', 'stats', 'tail', 'flow']);
export const DEAD_MS = 45000, HELLO_MS = 5000, HIDDEN_MS = 120000, BACKOFF_S = [5, 10, 30, 60];

export type Live = { stop: () => void; showTails: (keys: string[]) => void };

// EventSource gives no status; manual redirect and X-Requested-With make an ended IAP sign-in visible.
export async function probe(): Promise<'signin' | 'offline' | 'json'> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  try {
    const r = await fetch('/api/team-admin', { redirect: 'manual', cache: 'no-store', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    if (r.type === 'opaqueredirect' || r.status === 401) return 'signin';
    // A 5xx text answer is the gateway while the server restarts, not an ended sign-in.
    if (!r.ok) return 'offline';
    return (await r.json().then(() => true, () => false)) ? 'json' : 'signin';
  } catch {
    return 'offline';
  }
}

export function startLive(env: Omit<Env, 'tails'>): Live {
  let es: EventSource | null = null, opened = 0, stopPoll: (() => void) | null = null, stopped = false;
  let fails: number[] = [], backoff = 0, statsAt = 0, tails: string[] = [], asleep = false, notBefore = 0;
  const timers = { retry: 0 as unknown as ReturnType<typeof setTimeout>, hello: 0 as unknown as ReturnType<typeof setTimeout>, hidden: 0 as unknown as ReturnType<typeof setTimeout> };
  const conn = (data: Partial<Store['conn']>) => env.dispatch({ event: 'conn', data });
  const pollEnv: Env = { ...env, tails: () => tails };

  const close = () => { es?.close(); es = null; opened = 0; clearTimeout(timers.hello); };
  const poll = (on: boolean) => {
    if (on && !stopPoll) stopPoll = startPoller(pollEnv);
    if (!on && stopPoll) { stopPoll(); stopPoll = null; }
  };
  const retryIn = (s: number) => { clearTimeout(timers.retry); timers.retry = setTimeout(open, s * 1000); };
  const fallback = (retryS?: number) => {
    close(); poll(true); conn({ mode: 'polling' });
    if (retryS) notBefore = Date.now() + retryS * 1000;
    retryIn(retryS ?? BACKOFF_S[Math.min(backoff++, BACKOFF_S.length - 1)]!);
  };

  function open() {
    if (stopped || es || asleep) return;
    const seq = env.getState().conn.seq;
    es = new EventSource(seq ? `/api/live?since=${encodeURIComponent(seq)}` : '/api/live');
    if (env.getState().conn.mode !== 'polling') conn({ mode: 'connecting' });
    // A buffered stream (a gateway that reads the whole body) opens but gives no hello.
    es.onopen = () => { opened = Date.now(); clearTimeout(timers.hello); timers.hello = setTimeout(() => fallback(), HELLO_MS); };
    es.onerror = () => { void failed(); };
    for (const name of EVENTS) es.addEventListener(name, (e) => frame(name, e as MessageEvent));
  }

  async function failed() {
    const wasOpen = opened;
    close();
    const now = Date.now();
    fails = [...fails.filter((t) => now - t < 60000), now];
    // A stream that was open drops now and then: reconnect at once with since, and show nothing yet.
    if (wasOpen && fails.length < 3) return retryIn(1);
    const p = await probe();
    if (stopped || asleep) return;
    if (p === 'signin') { poll(false); return conn({ mode: 'signin', error: 'Your sign-in ended. Reload the page.' }); }
    if (p === 'offline') { poll(false); conn({ mode: 'offline', error: 'Server unreachable' }); return retryIn(BACKOFF_S[Math.min(backoff++, BACKOFF_S.length - 1)]!); }
    fallback();
  }

  function frame(name: EventName, e: MessageEvent) {
    let data: unknown;
    try { data = JSON.parse(e.data); } catch { return; }
    const f = RING.has(name) ? { event: name, data, id: e.lastEventId } : { event: name, data };
    if (!isFrame(f)) return;
    env.dispatch(f);
    if (f.event === 'hello') { clearTimeout(timers.hello); fails = []; backoff = 0; poll(false); sendTails(); }
    if (f.event === 'bye') {
      close();
      if (f.data.reason === 'full' || f.data.reason === 'off') return fallback(f.data.retry_s);
      return open(); // max_life or shutdown: resume at once with since
    }
    if (f.event === 'delta') reread(f.data.tbl, f.data.rows, f.data.deleted);
    const st = env.getState().live.stats;
    // Throttle: a stats read that fails would otherwise run again on each frame.
    if (st.want && !st.loading && Date.now() - statsAt > 10000) { statsAt = Date.now(); void loadStats(pollEnv, '/api/stats?inproc=1'); }
  }

  // history and the routine tables send keys only: read again what the page shows.
  function reread(tbl: string, rows: Record<string, unknown>[], deleted: string[]) {
    const st = env.getState();
    if (tbl === 'history') for (const r of rows) {
      const k = String(r.key);
      if (st.history[k]) void getJson<Record<string, unknown>[]>(`/api/history?key=${encodeURIComponent(k)}`).then((g) =>
        env.dispatch({ event: 'history', data: 'data' in g ? { key: k, rows: g.data } : { key: k, error: g.error } }));
    }
    if (tbl === 'routines' || tbl === 'routine_runs' || tbl === 'routine_tick') {
      for (const t of Object.keys(st.teamsUi.routines)) void getJson<Record<string, unknown>>(`/api/teams/${encodeURIComponent(t)}/routines`).then((g) => {
        if ('data' in g) env.dispatch({ event: 'routines', data: { team: t, list: g.data } });
      });
      if (tbl !== 'routine_tick') void loadSummary(pollEnv);
    }
    if (tbl === 'routine_runs') for (const id of [...rows.map((r) => String(r.routine_id)), ...deleted]) {
      if (!st.teamsUi.routineHist[id]) continue;
      const team = Object.entries(st.teamsUi.routines).find(([, l]) => Array.isArray(l) && l.some((r: { id?: unknown }) => String(r.id) === id))?.[0];
      if (team) void getJson<Record<string, unknown>[]>(`/api/teams/${encodeURIComponent(team)}/routines/${encodeURIComponent(id)}/history`).then((g) => {
        if ('data' in g) env.dispatch({ event: 'routine-hist', data: { id, runs: g.data } });
      });
    }
  }

  // Only shown terminals stream: the server reads at most 8 keys for this stream.
  function sendTails() {
    const sid = env.getState().live.sid;
    if (es && sid) void postJson('/api/live/tails', { sid, keys: tails.slice(0, 8) });
  }

  // The dead-stream rule: pings come every 15 s, so 45 s with no event is a dead stream.
  const dead = setInterval(() => {
    if (es && opened && Date.now() - Math.max(opened, env.getState().conn.lastEventAt) > DEAD_MS) { close(); open(); }
  }, 5000);
  // A tab hidden for 120 s closes its stream and sleeps; on show it opens with since, after the retry_s of a bye.
  const vis = () => {
    clearTimeout(timers.hidden);
    if (document.hidden) { timers.hidden = setTimeout(() => { asleep = true; close(); poll(false); clearTimeout(timers.retry); }, HIDDEN_MS); return; }
    asleep = false;
    if (es || env.getState().conn.mode === 'signin') return;
    const wait = notBefore - Date.now();
    if (wait > 0) { poll(true); retryIn(wait / 1000); } else { clearTimeout(timers.retry); open(); }
  };
  const online = () => { if (!es && env.getState().conn.mode === 'offline') open(); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', vis);
  if (typeof window !== 'undefined') window.addEventListener('online', online);
  open();

  return {
    stop() {
      stopped = true; close(); poll(false); clearInterval(dead); Object.values(timers).forEach(clearTimeout);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', vis);
      if (typeof window !== 'undefined') window.removeEventListener('online', online);
    },
    showTails(keys) { tails = [...new Set(keys)]; sendTails(); },
  };
}
