import { expect, test } from 'vitest';
import { initial, type State } from '../../live/reducers';
import { sessStatus, sessUsd } from '../../model/sessions';
import { loadPrefs } from '../../store/prefs';
import type { Session } from '../../store/types';
import { answersIn, outcome, pick, sideGroups, threadItems, TONE_OF } from './data';

const NOW = Date.parse('2026-11-03T12:00:00Z') / 1000;
function st(sessions: Session[], more: Partial<State> = {}): State {
  const s = initial(loadPrefs());
  return {
    ...s, ...more,
    feeds: { agents: { data: { sessions }, ageSeconds: 0, interval: 30, error: null, refreshing: false, fetchedAt: NOW }, ...more.feeds },
    sessions: { byKey: Object.fromEntries(sessions.map((x) => [x.key, x])), order: sessions.map((x) => x.key) },
  };
}

test('every sessStatus state has a dot tone and a word', () => {
  const rows: Session[] = [
    { key: 'a', state: 'starting' }, { key: 'b', state: 'wrapping', wrap_mode: 'push' }, { key: 'c', state: 'wrapping' }, { key: 'd', state: 'pr_open' },
    { key: 'e', state: 'paused' }, { key: 'f', state: 'failed' }, { key: 'g', state: 'stopped' }, { key: 'h', state: 'active', agent_alive: true },
    { key: 'i', state: 'active', turn_open: '1' }, { key: 'j', state: 'active' },
  ];
  const got = rows.map((x) => sessStatus(x));
  expect(new Set(got.map(([w]) => w)).size).toBe(10);
  for (const [w, t] of got) expect([w, TONE_OF[t]]).toEqual([w, expect.any(String)]);
});

test('sessUsd: agent.cost_usd, then agent.cost_so_far, then the stats row, then summary.cost', () => {
  const stats = { data: { rows: [{ src: 'slack', key: 'k', usd: 3 }] }, ageSeconds: 0, interval: 60, error: null, refreshing: false, fetchedAt: NOW };
  const s = st([], { feeds: { stats } });
  const x = (agent: Record<string, unknown>) => ({ key: 'k', agent, summary: '{"cost": 4}' });
  expect(sessUsd(s, x({ cost_usd: 1, cost_so_far: 2 }))).toBe(1);
  expect(sessUsd(s, x({ cost_so_far: 2 }))).toBe(2);
  expect(sessUsd(s, x({}))).toBe(3);
  expect(sessUsd(st([]), x({}))).toBe(4);
});

test('pick: the hash session when it is in the tab, else the first head; the side list has the same heads', () => {
  const ss: Session[] = [{ key: 'agent-new01', state: 'stopped', resume_from: 'agent-old01', created: NOW }, { key: 'agent-old01', state: 'stopped', created: NOW - 9 }, { key: 'agent-live1', state: 'active', created: NOW }];
  const s = (sel: string, tab = 'stopped') => ({ ...st(ss), route: { view: 'sessions' as const, tab, sel, rid: '', query: {} } });
  expect(pick(s('agent-old01'))?.key).toBe('agent-old01');
  expect(pick(s(''))?.key).toBe('agent-new01');
  expect(pick(s('agent-live1'))?.key).toBe('agent-new01');
  expect(sideGroups(s(''))!.flatMap((g) => g.items.map((i) => i.id))).toEqual(['agent-new01']);
});

test('threadItems: a unique id per message, the files after the reply that closes the turn, and one message per run of files', () => {
  const h = [
    { key: 'k1', role: 'person', at: 10, text: 'ask' }, { key: 'k1', role: 'agent', at: 30, text: 'a' }, { key: 'k1', role: 'agent', at: 30, text: 'b' },
    { key: 'k2', role: 'person', at: 50, text: 'again' },
  ];
  const items = threadItems(h, [{ key: 'k1', media: [{ name: 'a.png', at: 20 }, { name: 'b.mp4', at: 21 }] }]);
  expect(items.map((i) => i.role)).toEqual(['person', 'agent', 'agent', 'media', 'person']);
  expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  expect(items[3]).toMatchObject({ files: ['a.png', 'b.mp4'] });
  expect(items.map((i) => i.sep.split(' · ')[0])).toEqual(['k1', '', '', '', 'Resumed as k2']);
});

test('answersIn: only the rows of the Stats range, newest first by parsed time', () => {
  const at = (h: number) => new Date(Date.now() - h * 3600000).toISOString();
  const rows = [
    { src: 'answer', key: 'a', at: at(1) },
    { src: 'answer', key: 'b', at: new Date(Date.now() - 2 * 3600000 + 5 * 3600000).toISOString().replace('Z', '+05:00') },
    { src: 'answer', key: 'c', at: at(24 * 60) },
    { src: 'slack', key: 'd', at: at(1) },
  ];
  const s = st([], { feeds: { stats: { data: { rows }, ageSeconds: 0, interval: 60, error: null, refreshing: false, fetchedAt: NOW } } });
  expect(answersIn(s).map((r) => r.key)).toEqual(['a', 'b']);
});

test('outcome: none for a bare session; a PR with its state; the diff text by read_only', () => {
  expect(outcome(st([{ key: 'k' }]), { key: 'k' })).toBeNull();
  const full = { data: { team: { repo: 'example/repo' }, open_prs: [{ number: 7 }] }, ageSeconds: 0, interval: 60, error: null, refreshing: false, fetchedAt: NOW };
  const x = { key: 'k', pr_url: 'https://github.com/example/repo/pull/7' };
  expect(outcome(st([x], { feeds: { full } }), x)?.result).toEqual({ pr: { url: x.pr_url, text: 'example/repo #7', state: 'OPEN' } });
  const teams = { data: [{ profile: 'fxa', read_only: true }], ageSeconds: 0, interval: 300, error: null, refreshing: false, fetchedAt: NOW };
  const y = { key: 'k', summary: '{"diff": "2 files"}' };
  expect(outcome(st([y], { feeds: { teams } }), y)?.result).toEqual({ text: 'diff posted in Slack (read-only team)' });
});
