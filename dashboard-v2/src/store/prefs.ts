// The v1 localStorage keys, so v1 and v2 share them; storage can throw, and a stored value is checked.
import type { Prefs, StatsFilter, Theme } from './types';

export const SF_DEFAULT: StatsFilter = { range: '30d', from: '', to: '', src: 'all', kind: 'all', model: 'all', team: 'all', q: '' };
const RANGES = ['today', 'yesterday', '7d', '30d', '90d', 'month', 'lastmonth', 'all', 'custom'];
const SRCS = ['all', 'pipeline', 'slack', 'answer', 'pass', 'depfix'];
const KINDS = ['all', 'fix', 'feedback', 'rebase', 'pass', 'triage', 'session', 'answered', 'upgraded', 'not recorded'];
const TEAM = /^[a-z][a-z0-9-]{1,30}$/, DAY = /^\d{4}-\d{2}-\d{2}$/;

const read = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const json = (k: string): Record<string, unknown> => { try { const v = JSON.parse(read(k) ?? '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; } };
const write = (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* the setting lasts for the visit */ } };

// A stored filter keeps only the values the Stats view offers.
export function checkFilter(v: Record<string, unknown>): StatsFilter {
  const pick = (k: keyof StatsFilter, ok: (x: string) => boolean) => (typeof v[k] === 'string' && ok(v[k] as string) ? (v[k] as string) : SF_DEFAULT[k]);
  return {
    range: pick('range', (x) => RANGES.includes(x)), from: pick('from', (x) => DAY.test(x)), to: pick('to', (x) => DAY.test(x)),
    src: pick('src', (x) => SRCS.includes(x)), kind: pick('kind', (x) => KINDS.includes(x)), model: pick('model', (x) => x.length <= 100),
    team: pick('team', (x) => x === 'all' || TEAM.test(x)), q: pick('q', (x) => x.length <= 200),
  };
}

export function loadPrefs(): Prefs {
  const t = read('theme'), w = json('panelW'), pt = read('pipeTeam') ?? '';
  const panelW: Prefs['panelW'] = {};
  for (const k of ['--side', '--right'] as const) if (typeof w[k] === 'number' && Number.isFinite(w[k])) panelW[k] = w[k] as number;
  return {
    theme: (t === 'light' || t === 'dark' ? t : 'system') as Theme,
    keys: read('keys') === '1',
    pipeTeam: pt === 'fxa' || TEAM.test(pt) ? pt : '',
    sowner: (read('sowner') ?? '').slice(0, 200),
    panelW,
    noside: read('noside') === '1',
    noright: read('noright') === '1',
    sx: { term: json('sx').term !== false },
    statsFilter: checkFilter(json('statsFilter')),
  };
}

export function savePref<K extends keyof Prefs>(k: K, v: Prefs[K]): void {
  if (k === 'theme') write('theme', v === 'system' ? null : (v as string));
  else if (k === 'keys' || k === 'noside' || k === 'noright') write(k, v ? '1' : '0');
  else if (k === 'pipeTeam' || k === 'sowner') write(k, v as string);
  else write(k, JSON.stringify(v));
}
