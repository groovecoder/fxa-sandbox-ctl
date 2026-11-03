// The stream client of section 4.5: one EventSource, resume with since, the dead-stream rule, the hidden-tab
// close, the sign-in probe, the poll fallback and its backoff, with a fake EventSource and fake timers.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { SF_DEFAULT } from '../store/prefs';
import { type Action, type State, apply, initial } from './reducers';
import { type Live, startLive } from './sse';

class FakeES {
  static all: FakeES[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  lastId = '';
  private on: Record<string, ((e: { data: string; lastEventId: string }) => void)[]> = {};
  constructor(public url: string) { FakeES.all.push(this); }
  addEventListener(n: string, f: (e: { data: string; lastEventId: string }) => void) { (this.on[n] ??= []).push(f); }
  close() { this.closed = true; }
  emit(event: string, data: unknown, id?: string) { if (id) this.lastId = id; for (const f of this.on[event] ?? []) f({ data: JSON.stringify(data), lastEventId: this.lastId }); }
}
const open = () => FakeES.all.filter((e) => !e.closed);
const last = () => FakeES.all[FakeES.all.length - 1]!;
const HELLO = { v: 1, epoch: 'e1', sid: 's1', viewer: { user: 'user@example.com', admin: true, teams: [] }, retention_s: 300, max_life_s: 900 };
const SNAP = { feeds: {}, sessions: [], errors: [], stats: null, flow: [] };

let st: State, live: Live, probe: 'json' | '401' | 'redirect' | 'throw' | '500', calls: string[], doc: EventTarget & { hidden: boolean };
const env = { dispatch: (a: Action) => { st = apply(st, a); }, getState: () => st };
const res = (body: unknown, status = 200, headers: Record<string, string> = {}) => ({ ok: status < 300, status, type: 'basic', headers: new Headers(headers), json: async () => body });

beforeEach(() => {
  vi.useFakeTimers();
  FakeES.all = []; calls = []; probe = 'json';
  st = initial({ theme: 'system', keys: false, pipeTeam: '', sowner: '', panelW: {}, noside: false, noright: false, sx: { term: true }, statsFilter: SF_DEFAULT });
  doc = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal('document', doc);
  vi.stubGlobal('EventSource', FakeES);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(init?.method === 'POST' ? `POST ${url} ${init.body}` : url);
    if (url === '/api/team-admin' && init?.redirect === 'manual') {
      if (probe === 'throw') throw new TypeError('Failed to fetch');
      if (probe === 'redirect') return { ok: false, status: 0, type: 'opaqueredirect', headers: new Headers(), json: async () => { throw new SyntaxError('no body'); } };
      if (probe === '500') return { ok: false, status: 500, type: 'basic', headers: new Headers(), json: async () => { throw new SyntaxError('text/plain'); } };
      return probe === '401' ? res({ error: 'sign in' }, 401) : res({ admin: true });
    }
    if (url.startsWith('/api/stats')) return res({ rows: [] }, 200, { ETag: '"e-1"' });
    if (url === '/api/errors') return res([]);
    return res({});
  }));
});
afterEach(() => { live?.stop(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const connect = async () => { live = startLive(env); last().onopen?.(); last().emit('hello', HELLO); last().emit('snapshot', SNAP, 'e1-1'); await vi.advanceTimersByTimeAsync(0); };

test('one EventSource per tab; a bye at max life resumes at once with since', async () => {
  await connect();
  expect(FakeES.all.map((e) => e.url)).toEqual(['/api/live']);
  expect(st.conn.mode).toBe('live');
  last().emit('ping', { at: 1 });
  last().emit('bye', { reason: 'max_life' });
  expect(open().map((e) => e.url)).toEqual(['/api/live?since=e1-1']);
});

test('the snapshot asks for the stats copy once, with its ETag', async () => {
  await connect();
  expect(calls.filter((c) => c.startsWith('/api/stats'))).toEqual(['/api/stats?inproc=1']);
  expect(st.live.stats.etag).toBe('"e-1"');
});

test('45 s with no event is a dead stream; pings keep it open', async () => {
  await connect();
  for (let i = 0; i < 4; i++) { await vi.advanceTimersByTimeAsync(15000); last().emit('ping', { at: i }); }
  expect(FakeES.all).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(50000);
  expect(FakeES.all).toHaveLength(2);
  expect(open().map((e) => e.url)).toEqual(['/api/live?since=e1-1']);
});

test('a tab hidden for 120 s closes its stream and opens it with since when it shows', async () => {
  await connect();
  doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(110000);
  expect(open()).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(11000);
  expect(open()).toHaveLength(0);
  doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange'));
  expect(open().map((e) => e.url)).toEqual(['/api/live?since=e1-1']);
});

test('a retry that falls due after the hidden close opens no stream in the hidden tab', async () => {
  await connect();
  doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(100000);
  last().emit('bye', { reason: 'full', retry_s: 60 });
  await vi.advanceTimersByTimeAsync(81000);
  expect(open()).toHaveLength(0);
  doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange'));
  expect(open()).toHaveLength(1);
});

test('a tab that shows again keeps the retry_s of a bye full', async () => {
  await connect();
  last().emit('bye', { reason: 'full', retry_s: 30 });
  doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange'));
  doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange'));
  expect(open()).toHaveLength(0);
  await vi.advanceTimersByTimeAsync(30000);
  expect(open()).toHaveLength(1);
});

test('a failed connect and a probe that gets JSON: poll, retry the stream with backoff, stop the polls on hello', async () => {
  live = startLive(env);
  last().onerror?.();
  await vi.advanceTimersByTimeAsync(0);
  expect(st.conn.mode).toBe('polling');
  expect(calls).toEqual(expect.arrayContaining(['/api/snapshot', '/api/errors', '/api/stats']));
  expect(calls.some((c) => c.startsWith('/api/sessions'))).toBe(true);
  await vi.advanceTimersByTimeAsync(5000);
  expect(FakeES.all).toHaveLength(2);
  last().onerror?.();
  await vi.advanceTimersByTimeAsync(9000);
  expect(FakeES.all).toHaveLength(2);
  await vi.advanceTimersByTimeAsync(1000);
  expect(FakeES.all).toHaveLength(3);
  last().onopen?.(); last().emit('hello', HELLO);
  expect(st.conn.mode).toBe('live');
  calls = [];
  await vi.advanceTimersByTimeAsync(30000);
  expect(calls.filter((c) => c === '/api/snapshot')).toEqual([]);
});

test.each([['401'], ['redirect']] as const)('a probe that gets %s: sign-in mode, and no retry loop', async (p) => {
  probe = p;
  live = startLive(env);
  last().onerror?.();
  await vi.advanceTimersByTimeAsync(0);
  expect(st.conn).toMatchObject({ mode: 'signin', error: 'Your sign-in ended. Reload the page.' });
  await vi.advanceTimersByTimeAsync(120000);
  expect(FakeES.all).toHaveLength(1);
});

test('a probe that throws: offline, and the stream is tried again', async () => {
  probe = 'throw';
  live = startLive(env);
  last().onerror?.();
  await vi.advanceTimersByTimeAsync(0);
  expect(st.conn.mode).toBe('offline');
  await vi.advanceTimersByTimeAsync(5000);
  expect(FakeES.all).toHaveLength(2);
});

test('a probe that gets a 500 text answer (the server restarts): offline, not sign-in, and the stream is tried again', async () => {
  probe = '500';
  live = startLive(env);
  last().onerror?.();
  await vi.advanceTimersByTimeAsync(0);
  expect(st.conn.mode).toBe('offline');
  await vi.advanceTimersByTimeAsync(5000);
  expect(FakeES.all).toHaveLength(2);
});

test('bye full: poll, and try the stream again after retry_s', async () => {
  await connect();
  last().emit('bye', { reason: 'full', retry_s: 30 });
  expect(st.conn.mode).toBe('polling');
  await vi.advanceTimersByTimeAsync(29000);
  expect(open()).toHaveLength(0);
  await vi.advanceTimersByTimeAsync(1000);
  expect(open()).toHaveLength(1);
});

test('a stream that opens but gives no hello in 5 s is buffered: poll', async () => {
  live = startLive(env);
  last().onopen?.();
  await vi.advanceTimersByTimeAsync(5000);
  expect(st.conn.mode).toBe('polling');
  expect(open()).toHaveLength(0);
});

test('a stream that drops after it was live reconnects with since and shows no mode change', async () => {
  await connect();
  last().onerror?.();
  await vi.advanceTimersByTimeAsync(1000);
  expect(open().map((e) => e.url)).toEqual(['/api/live?since=e1-1']);
  expect(calls).not.toContain('/api/snapshot');
});

test('showTails sends the shown keys, at most 8, with the stream id', async () => {
  await connect();
  live.showTails(Array.from({ length: 10 }, (_, i) => `agent-ex000${i}`));
  const post = [...calls].reverse().find((c) => c.startsWith('POST /api/live/tails'))!;
  expect(JSON.parse(post.slice('POST /api/live/tails '.length))).toEqual({ sid: 's1', keys: Array.from({ length: 8 }, (_, i) => `agent-ex000${i}`) });
});
