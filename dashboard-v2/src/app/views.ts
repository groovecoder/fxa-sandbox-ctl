// The view registry: the v1 VIEWS list, with the panels that each view shows.
import type { ComponentType, ReactNode } from 'react';
import type { ViewId } from '../router/types';
import type { Store } from '../store/types';
import type { SideGroup } from './store';

// The default export of a view's lazy chunk: its main content, and its side list and details when it has them.
// sideTools: more filters under the side list's search box.
export type ViewChunk = { Main: ComponentType; side?: (s: Store) => SideGroup[] | null; right?: (s: Store) => ReactNode | null; sideTools?: ComponentType };

export type ViewDef = {
  id: ViewId;
  title: string;
  sub: string;
  tabs: { id: string; label: string }[];
  side: boolean;
  right: boolean;
  // Tabs that show neither panel (v1 body.bare).
  bareTabs: string[];
  // The view's chunk, as () => import('../views/<view>'); it loads on the first visit.
  load?: () => Promise<{ default: ViewChunk }>;
};

const tabs = (...t: [string, string][]) => t.map(([id, label]) => ({ id, label }));

export const VIEWS: ViewDef[] = [
  { id: 'overview', title: 'Overview', sub: "What needs you, what is running, and today's cost", tabs: [], side: false, right: false, bareTabs: [], load: () => import('../views/overview') },
  {
    id: 'pipeline', title: 'Pipeline', sub: 'Jira tickets from the queue to the merge',
    tabs: tabs(['belts', 'Belts'], ['queue', 'Queue and review'], ['done', 'Done']), side: false, right: false, bareTabs: [],
    load: () => import('../views/pipeline'),
  },
  {
    id: 'sessions', title: 'Sessions', sub: 'Slack threads and their sandboxes',
    tabs: tabs(['live', 'Live'], ['paused', 'Paused'], ['stopped', 'Stopped'], ['answers', 'Answers']), side: true, right: true, bareTabs: ['answers'],
    load: () => import('../views/sessions'),
  },
  {
    id: 'stats', title: 'Stats', sub: 'Spend, time and capacity',
    tabs: tabs(['spend', 'Spend'], ['prs', 'PRs'], ['runners', 'Runners and LLM'], ['pipeline', 'Pipeline']), side: true, right: false, bareTabs: [],
  },
  {
    id: 'errors', title: 'Errors', sub: 'Failures from the controller and the bot, grouped by signature',
    tabs: tabs(['open', 'Open'], ['all', 'All']), side: true, right: true, bareTabs: [],
  },
  {
    id: 'runners', title: 'Sandboxes', sub: 'Where the agents run, who uses them, and what it costs',
    tabs: tabs(['all', 'All'], ['pipeline', 'Pipeline'], ['slack', 'Slack'], ['routines', 'Routines']), side: false, right: true, bareTabs: [],
    load: () => import('../views/runners'),
  },
  {
    id: 'teams', title: 'Teams', sub: 'Which teams exist, what each gets, who can start one, and how each is doing',
    tabs: [], side: true, right: false, bareTabs: [], load: () => import('../views/teams'),
  },
];

// An unknown view goes to Overview, as in v1.
export const viewOf = (id: string): ViewDef => VIEWS.find((v) => v.id === id) ?? VIEWS[0]!;
