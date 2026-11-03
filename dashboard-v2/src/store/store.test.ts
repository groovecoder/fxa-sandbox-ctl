import { afterEach, expect, test, vi } from 'vitest';
import { latest } from '../live/api';
import { SF_DEFAULT, loadPrefs, savePref } from './prefs';

afterEach(() => { vi.unstubAllGlobals(); });

const memStorage = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, m };
};

test('prefs read the v1 keys, and a stored value that the views do not offer goes back to the default', () => {
  vi.stubGlobal('localStorage', memStorage({
    theme: 'dark', keys: '1', pipeTeam: 'example', noside: '1', sx: '{"term":false}', panelW: '{"--side":300,"--right":"x","--evil":1}',
    statsFilter: JSON.stringify({ range: '7d', src: 'slack', team: '../x', kind: 'nope', from: '2026-11-01', q: 'abc' }),
  }));
  expect(loadPrefs()).toEqual({
    theme: 'dark', keys: true, pipeTeam: 'example', sowner: '', panelW: { '--side': 300 }, noside: true, noright: false, sx: { term: false },
    statsFilter: { ...SF_DEFAULT, range: '7d', src: 'slack', from: '2026-11-01', q: 'abc' },
  });
});

test('prefs survive a storage that throws, and saves use the v1 forms', () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } });
  expect(loadPrefs().statsFilter).toEqual(SF_DEFAULT);
  expect(() => savePref('keys', true)).not.toThrow();
  const s = memStorage({ theme: 'dark' });
  vi.stubGlobal('localStorage', s);
  savePref('theme', 'system'); savePref('noright', true); savePref('sx', { term: true });
  expect(Object.fromEntries(s.m)).toEqual({ noright: '1', sx: '{"term":true}' });
});

test('latest: an older answer that comes after a newer one for the same key is dropped', async () => {
  const wait: ((v: unknown) => void)[] = [];
  vi.stubGlobal('fetch', vi.fn(() => new Promise((r) => wait.push(r))));
  const a = latest('history:agent-ex0001', '/api/history?key=agent-ex0001'), b = latest('history:agent-ex0001', '/api/history?key=agent-ex0001');
  const res = (body: unknown) => ({ ok: true, status: 200, headers: new Headers(), json: async () => body });
  wait[1]!(res([{ n: 2 }]));
  wait[0]!(res([{ n: 1 }]));
  expect(await b).toEqual({ data: [{ n: 2 }], etag: null });
  expect(await a).toBeNull();
});
