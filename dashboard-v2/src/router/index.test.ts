import { expect, test } from 'vitest';
import { badPipeLink, firstSessTab, format, HOME, parse } from './index';

const canon = (h: string, prev = HOME) => format(parse(h, prev));

test('a v1 link keeps its route, and the chosen tab is written back', () => {
  expect(canon('#pipeline/belts/FXA-1')).toBe('#pipeline/belts/FXA-1');
  expect(canon('#stats')).toBe('#stats/spend');
  expect(canon('')).toBe('#overview');
  expect(canon('#nope/x')).toBe('#overview');
});

test('an unknown tab keeps the current tab of the same view, else the first tab', () => {
  const prev = parse('#stats/prs');
  expect(canon('#stats/bogus', prev)).toBe('#stats/prs');
  expect(canon('#errors/bogus', prev)).toBe('#errors/open');
});

test('the legacy rewrites', () => {
  expect(canon('#pipeline/board/FXA-12')).toBe('#pipeline/belts/FXA-12');
  expect(canon('#pipeline/board/not-a-key')).toBe('#pipeline/belts');
  expect(canon('#teams/routines/example')).toBe('#teams/example/routines');
  expect(canon('#teams/all')).toBe('#teams');
  expect(canon('#teams/routines')).toBe('#teams');
});

test('the teams routes', () => {
  expect(parse('#teams')).toMatchObject({ view: 'teams', sel: '', tab: 'overview' });
  expect(parse('#teams/new')).toMatchObject({ sel: 'new' });
  expect(parse('#teams/example/routines/12')).toMatchObject({ sel: 'example', tab: 'routines', rid: '12' });
  expect(canon('#teams/example/routines/12')).toBe('#teams/example/routines/12');
  expect(canon('#teams/example/overview')).toBe('#teams/example');
  expect(canon('#teams/Bad_Team')).toBe('#teams');
});

test('the selections are checked, and the query keeps only the known keys', () => {
  expect(parse('#sessions/live/agent-ab12').sel).toBe('agent-ab12');
  expect(parse('#sessions/live/<script>').sel).toBe('');
  expect(parse('#pipeline/belts/a%20b').sel).toBe('');
  expect(badPipeLink('#pipeline/belts/a%20b')).toBe(true);
  expect(badPipeLink('#pipeline/belts/FXA-1')).toBe(false);
  expect(canon('#errors/open/sig%2F1')).toBe('#errors/open/sig%2F1');
  expect(canon('#runners/all/slot-1')).toBe('#runners/all/slot-1');
  expect(canon('#stats/spend?range=7d&src=slack&evil=1')).toBe('#stats/spend?range=7d&src=slack');
  expect(canon('#overview?range=30d&metric=spend')).toBe('#overview?range=30d&metric=spend');
});

test('#sessions with no tab picks the first tab with a row', () => {
  expect(firstSessTab(['stopped', 'paused'])).toBe('paused');
  expect(firstSessTab([])).toBe('live');
});
