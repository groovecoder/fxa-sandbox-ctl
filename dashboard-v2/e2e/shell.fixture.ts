// A hand-made C2 store and fixed selector results: the shell tests do not wait on the W1-DATA ports.
import type { Page } from '@playwright/test';
import type { FixedSel } from '../src/app/store';
import type { Store } from '../src/store/types';

export type Fixture = { store: Omit<Store, 'prefs' | 'route'>; sel: FixedSel };

const snap = {
  repo: 'example/repo',
  team: { name: 'FxA' },
  health: { seconds_since_pass: 240, free_gb: 80, min_free_gb: 20, lock_held: false },
  mode: {},
  queue: { ready: [{ key: 'FXA-3', summary: 'Queue one' }], skipped: [{ key: 'FXA-7' }] },
  review: [{ key: 'FXA-1' }, { key: 'FXA-2' }],
  inflight: [{ key: 'FXA-4', summary: 'Fix the sign-in page' }],
  merged_prs: [{ key: 'FXA-9', number: 9 }, { number: 10 }],
};
const feed = (data: unknown, ageSeconds: number, interval: number) => ({ data, ageSeconds, interval, error: null, refreshing: false, fetchedAt: 1 });
const sess = (key: string, state: string, created: number) => ({ key, state, created, request: `Request for ${key}` });

// A new copy each call: a test that changes its fixture never changes the next test's.
export const base = (): Fixture => structuredClone({
  store: {
    conn: { mode: 'live', lastEventAt: 1, seq: 'e-1' },
    viewer: { user: 'user@example.com', admin: true, teams: ['example'] },
    feeds: {
      full: feed(snap, 40, 60),
      agents: feed({ backend: 'gce', runner_hourly_usd: 1.5, infra_hourly_usd: 0.5 }, 10, 30),
      stats: feed({ rows: [] }, 100, 60),
      teams: feed([{ profile: 'example', label: 'Example' }, { profile: 'fxa', label: 'FxA' }], 20, 60),
      errors: feed([{ sig: 'abc123', status: 'open', message: 'boom' }, { sig: 'def456', status: 'resolved', message: 'old' }], 5, 15),
      'team:example': feed({ redacted: true, counts: { review: 1, inflight: 2, ready: 3 }, team: { name: 'Example' } }, 30, 60),
    },
    sessions: {
      byKey: { 'agent-aaaa1': sess('agent-aaaa1', 'active', 3), 'agent-bbbb2': sess('agent-bbbb2', 'paused', 2), 'agent-cccc3': sess('agent-cccc3', 'stopped', 1) },
      order: ['agent-aaaa1', 'agent-bbbb2', 'agent-cccc3'],
    },
    tails: {},
    history: {},
    usage: {},
    teamsUi: { routines: { example: { routines: [{ id: 4, name: 'Nightly review' }] } }, routineHist: {}, memory: {} },
    flow: { points: [] },
  },
  sel: {
    alerts: [
      { tone: 'bad', subject: 'tickets', what: 'the snapshot read failed: a long error text that the strip cuts, with the full text in the tooltip', fix: 'fxa-sandbox-ctl stop slot-1' },
      { tone: 'warn', subject: 'pass', what: 'last pass 30m ago; the cron fires every 20 minutes' },
    ],
    health: { level: 'warn', word: 'degraded', title: 'gce · lock free · launchcap 2 · 80GB free' },
    ovNeeds: { total: 3, sandbox: 1, by: {}, unknown: false },
    sbBadge: { n: 2, tone: 'warn', label: '2 sandboxes need a fix' },
    teamBadge: 'warn',
    beltGroups: { outside: [{ t: { slack: true }, age: 4 }, { t: { slack: true }, age: 1 }] },
    beltCount: 5,
    waiting: ['FXA-1'],
    heads: ['agent-aaaa1', 'agent-bbbb2', 'agent-cccc3'],
    answerRows: [{ src: 'answer' }, { src: 'answer' }],
    queueWaits: [{ key: 'FXA-7' }],
    pipeSnap: snap,
    side: {
      sessions: [{ group: 'Today', items: [
        { id: 'agent-aaaa1', d: 'live', t: 'Fix the login copy', m: ['$1.20', 'user', 'active'] },
        { id: 'agent-dddd4', d: '', t: 'Write a test', m: ['$0.40', 'user'] },
      ] }],
      errors: [],
      teams: [
        { items: [{ id: '__all', d: 'ok', t: 'All teams', m: ['2 teams'] }] },
        { group: 'Teams', items: [{ id: 'example', d: 'ok', t: 'Example', m: ['1 repo'] }, { id: 'fxa', d: 'warn', t: 'FxA', m: ['3 repos'] }] },
      ],
    },
  },
} satisfies Fixture);

type Patch = { store?: Partial<Fixture['store']>; sel?: Partial<FixedSel> };

// Load the page at a hash with the base fixture, or with a patch over it.
export async function open(page: Page, hash: string, patch: Patch = {}, init?: (fx: Fixture) => void) {
  const fx = base();
  Object.assign(fx.store, patch.store);
  Object.assign(fx.sel, patch.sel);
  init?.(fx);
  await page.addInitScript((f) => { (window as { __V2_FIXTURE__?: unknown }).__V2_FIXTURE__ = f; }, fx);
  await page.goto(`/v2/${hash}`);
  // The favicon link comes in the same effect flush as the key listener, so the page then takes keys.
  await page.locator('#favicon').waitFor({ state: 'attached' });
}

// Change the store after load, as a live delta would.
export const setStore = (page: Page, patch: Record<string, unknown>) =>
  page.evaluate((p) => (window as unknown as { __V2_STORE__: { setState: (x: unknown) => void } }).__V2_STORE__.setState(p), patch);
