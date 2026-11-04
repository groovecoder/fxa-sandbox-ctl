import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { VIEWS, viewOf } from './views';

const v1 = readFileSync(new URL('../../../dashboard/index.html', import.meta.url), 'utf8');

test('the registry has the v1 views, titles, subs and tabs in the v1 order', () => {
  const src = v1.match(/^const VIEWS = (\[[\s\S]*?^\]);/m)?.[1];
  expect(src).toBeTruthy();
  const want = new Function(`return ${src}`)() as [string, string, string, [string, string][]][];
  // v2 drops the Needs you card from Overview, so its subtitle no longer names it.
  want.find((v) => v[0] === 'overview')![2] = 'What is running, what it costs, and how the teams do';
  // The review PRs moved to Belts, so the second Pipeline tab is the queue alone.
  (want.find((v) => v[0] === 'pipeline')![3] as string[][])[1]![1] = 'Queue';
  expect(VIEWS.map((v) => [v.id, v.title, v.sub, v.tabs.map((t) => [t.id, t.label])])).toEqual(want);
});

test('an unknown view goes to Overview', () => {
  expect(viewOf('nope').id).toBe('overview');
  expect(viewOf('teams').id).toBe('teams');
});
