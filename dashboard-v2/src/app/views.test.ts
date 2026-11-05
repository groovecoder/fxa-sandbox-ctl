import { expect, test } from 'vitest';
import { VIEWS, viewOf } from './views';

test('the registry has the views, titles, subs and tabs in order', () => {
  expect(VIEWS.map((v) => [v.id, v.title, v.sub, v.tabs.map((t) => [t.id, t.label])])).toEqual([
    ['overview', 'Overview', 'What is running, what it costs, and how the teams do', []],
    ['pipeline', 'Pipeline', 'Jira tickets from the queue to the merge', [['belts', 'Belts'], ['queue', 'Queue'], ['done', 'Done']]],
    ['sessions', 'Sessions', 'Slack threads and their sandboxes', [['live', 'Live'], ['paused', 'Paused'], ['stopped', 'Stopped'], ['answers', 'Answers']]],
    ['stats', 'Stats', 'Spend, time and capacity', [['spend', 'Spend'], ['prs', 'PRs'], ['runners', 'Runners and LLM'], ['pipeline', 'Pipeline']]],
    ['errors', 'Errors', 'Failures from the controller and the bot, grouped by signature', [['open', 'Open'], ['all', 'All']]],
    ['runners', 'Sandboxes', 'Where the agents run, who uses them, and what it costs', [['all', 'All'], ['pipeline', 'Pipeline'], ['slack', 'Slack'], ['routines', 'Routines']]],
    ['teams', 'Teams', 'Which teams exist, what each gets, who can start one, and how each is doing', []],
  ]);
});

test('an unknown view goes to Overview', () => {
  expect(viewOf('nope').id).toBe('overview');
  expect(viewOf('teams').id).toBe('teams');
});
