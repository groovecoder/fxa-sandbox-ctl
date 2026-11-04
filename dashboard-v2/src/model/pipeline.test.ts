// All teams joins each team's lists; two teams on one repo must not show a PR twice.
import { expect, test } from 'vitest';
import { snapshotActions } from '../live/poll';
import { apply, initial } from '../live/reducers';
import { SF_DEFAULT } from '../store/prefs';
import { beltGroups, pipeSnap } from './index';

test('a PR that two teams list shows once in All teams', () => {
  const pr = { key: 'FXA-1', number: 7, title: 'fix: x', created: new Date().toISOString() };
  const snap = { inflight: [], review: [], blocked: [{ key: 'FXA-1', why: 'needs a decision', kind: 'needs_decision' }], open_prs: [pr], merged_prs: [] };
  let st = initial({ theme: 'system', keys: false, pipeTeam: '', sowner: '', panelW: {}, noside: false, noright: false, sx: { term: true }, statsFilter: SF_DEFAULT });
  snapshotActions({ snapshot: snap, teams: { fxa: { snapshot: snap }, entitlements: { snapshot: snap } } }).forEach((a) => { st = apply(st, a); });
  const s = pipeSnap(st) as { open_prs: unknown[]; blocked: unknown[] };
  expect(s.open_prs).toHaveLength(1);
  expect(s.blocked).toHaveLength(1);
  const keys = Object.values(beltGroups(st)).flatMap((g) => (Array.isArray(g) ? g.map((r: { t: { key: string } }) => r.t.key) : []));
  expect(keys.filter((k) => k === 'FXA-1')).toHaveLength(1);
});
