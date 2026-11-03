// Each C2 selector equals its v1 golden result; the store is built through the poll converters and the reducers.
import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { errorsAction, snapshotActions, teamsAction, viewerAction } from '../live/poll';
import { type Action, type State, apply, initial } from '../live/reducers';
import { SF_DEFAULT } from '../store/prefs';
import * as model from './index';
import { ovStats } from './stats';

const fixtures = new URL('../../../skills/fxa-ctl-dev/', import.meta.url);
const golden = new URL('../../test/golden/', import.meta.url);
const names = readdirSync(golden).filter((f) => f.endsWith('.json'));
type J = ReturnType<typeof JSON.parse>;

// page.sh: "@iso-3600" is an ISO time an hour before now, "@epoch+600" an epoch 10 min after, "@day-2" two days before today.
function rel(v: J, now: number): J {
  if (Array.isArray(v)) return v.map((x) => rel(x, now));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rel(x, now)]));
  const m = typeof v === 'string' ? v.match(/^@(iso|epoch|day)([+-]\d+)$/) : null;
  if (!m) return v;
  if (m[1] === 'day') return new Date(Math.floor(now / 86400) * 86400000 + Number(m[2]) * 86400000).toISOString().slice(0, 10);
  const t = now + Number(m[2]);
  return m[1] === 'epoch' ? Math.trunc(t) : new Date(t * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}
// page.sh's fetch stub: the longest fixture key that the path starts with; a miss is [] for a list path, else {}.
function stub(fx: Record<string, J>, path: string): J {
  const k = Object.keys(fx).filter((x) => path === x || path.startsWith(x + '/')).sort((a, b) => b.length - a.length)[0];
  return k ? fx[k] : /sessions/.test(path) ? { sessions: [], cursor: null } : /routines|errors/.test(path) ? [] : {};
}
function storeOf(fx: Record<string, J>): State {
  let st = initial({ theme: 'system', keys: false, pipeTeam: '', sowner: '', panelW: {}, noside: false, noright: false, sx: { term: true }, statsFilter: SF_DEFAULT });
  const d = (a: Action) => { st = apply(st, a); };
  const ok = (data: J) => ({ data, etag: null });
  d(viewerAction(ok(stub(fx, '/api/team-admin'))));
  d(teamsAction(ok(stub(fx, '/api/teams'))));
  snapshotActions(stub(fx, '/api/snapshot')).forEach(d);
  d(errorsAction(ok(stub(fx, '/api/errors'))));
  const stats = stub(fx, '/api/stats');
  d(stats && !stats.error ? { event: 'stats-base', data: { stats, etag: null } } : { event: 'stats-error', data: { error: String(stats?.error) } });
  if (st.viewer.admin) { const j = stub(fx, '/api/routines/summary'); d({ event: 'rtsum', data: j?.teams ? { data: j, error: '' } : { data: null, error: 'no summary' } }); }
  return st;
}

// The golden script's JSON form: Infinity and NaN as text, a Set as a list, undefined as "undefined".
const rep = (_: string, v: unknown) => (v === Infinity ? 'Infinity' : v === -Infinity ? '-Infinity' : Number.isNaN(v) ? 'NaN'
  : v instanceof Set ? [...v] : v instanceof Map ? Object.fromEntries(v) : v);
const norm = (v: unknown) => (v === undefined ? 'undefined' : JSON.parse(JSON.stringify(v, rep)));
const u = (v: unknown) => (v === undefined ? 'undefined' : v);
const byKey = (xs: J[], f: (x: J) => unknown) => Object.fromEntries(xs.map((x) => [x.key ?? x.profile, u(f(x))]));
// v1 verdictTag gives the tag's HTML: <span class="tag TONE" title="T">LABEL</span>.
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function verdictOf(h: string) {
  const m = h.match(/^<span class="tag ?([^"]*)"(?: title="([^"]*)")?>(.*)<\/span>$/);
  if (!m) return h;
  const cls = (m[1] ?? '').split(' ').filter(Boolean);
  return { label: unesc(m[3] ?? ''), tone: cls.filter((c) => c !== 'run').join(' '), ...(cls.includes('run') ? { run: true } : {}), ...(m[2] != null ? { title: unesc(m[2]) } : {}) };
}

function results(st: State): Record<string, unknown> {
  const now = Date.now(), SS = st.sessions.order.map((k) => st.sessions.byKey[k]!), snap = model.pipeSnap(st) as J;
  const REV: J[] = snap?.review ?? [], TS: J[] = (st.feeds.teams?.data as J[]) ?? [];
  const ranges = ['today', 'yesterday', '7d', '30d', '90d', 'month', 'lastmonth', 'all'];
  const items = model.boardItems(st), bg = model.beltGroups(st), [lo7] = model.statsBounds('7d', now), ov = ovStats(st);
  const b = model.sbBadge(st), h = model.health(st);
  return {
    pipeSnap: snap ?? undefined, merged: model.merged(st), boardItems: items, classify: items.map((i) => model.classify(st, i)),
    laneRows: model.laneRows(st), beltGroups: bg, beltCount: model.beltCount(bg), floorRows: model.floorRows(st), ovFloor: model.ovFloor(st),
    ovNeeds: model.ovNeeds(st), sbRows: model.sbRows(st), sbBadge: { n: b.n, cls: b.tone, label: b.label }, strays: model.strays(st),
    statsBounds: Object.fromEntries(ranges.map((r) => [r, model.statsBounds(r, now)])), answerRows: model.answerRows(st),
    sessHeads: model.sessHeads(SS).map((x) => x.key), chainOf: byKey(SS, (x) => model.chainOf(x, SS).map((y) => y.key)),
    sessStatus: byKey(SS, (x) => model.sessStatus(st, x)), sessUsd: byKey(SS, (x) => model.sessUsd(st, x) ?? undefined),
    isWaitingOnHuman: byKey(REV, model.isWaitingOnHuman), verdictTag: byKey(REV, model.verdictTag),
    queueWaits: model.queueWaits(st), skipGroups: model.skipGroups(model.queueWaits(st)),
    teamNeeds: byKey(TS, (t) => model.teamNeeds(st, t)), teamBadge: model.teamBadge(st, TS), teamErrs: model.teamErrs(st),
    costPerMerged: model.costPerMerged(lo7, Infinity, ov?.prs ?? [], ov?.rows ?? []),
    health: { dot: `dot ${h.level}`, word: h.word },
    alerts: model.alerts(st).map((a) => ({ tone: a.tone, text: a.subject + a.what + (a.fix ?? '') })),
  };
}
// The v1 forms that C2 gives as data: the tag HTML, the class with its leading space.
function goldenOf(g: Record<string, J>): Record<string, unknown> {
  return { ...g, verdictTag: Object.fromEntries(Object.entries(g.verdictTag ?? {}).map(([k, v]) => [k, typeof v === 'string' ? verdictOf(v) : v])),
    teamBadge: typeof g.teamBadge === 'string' ? g.teamBadge.trim() : g.teamBadge };
}

beforeAll(() => { vi.stubEnv('TZ', 'UTC'); vi.useFakeTimers({ toFake: ['Date'] }); });
afterAll(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe.each(names)('%s', (name) => {
  const g = JSON.parse(readFileSync(new URL(name, golden), 'utf8'));
  test('each C2 selector equals the v1 result', () => {
    vi.setSystemTime(g.now);
    const fx = rel(JSON.parse(readFileSync(new URL(name, fixtures), 'utf8')), g.now / 1000);
    const mine = results(storeOf(fx)), want = goldenOf(g);
    const selectors = Object.keys(model).filter((k) => typeof (model as Record<string, unknown>)[k] === 'function');
    expect(Object.keys(mine).sort()).toEqual(selectors.sort());
    for (const k of selectors) expect(norm(mine[k]), k).toEqual(want[k]);
  });
});
