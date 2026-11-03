// C2, the store shape. W1-DATA fills the store; the shell and the views read it through selectors.
import type { FlowPoint, Session, Viewer } from '../live/schema';
import type { Route } from '../router/types';

export type { FlowPoint, Session, Viewer };

export type ConnMode = 'connecting' | 'live' | 'polling' | 'offline' | 'signin';

// full is the server Feed "snapshot", team:<t> is "snapshot:<t>", team-test:<t> keeps its name.
export type FeedName = 'full' | 'agents' | 'stats' | 'teams' | 'errors' | 'overview' | `team:${string}` | `team-test:${string}`;

// The fields come from the snapshot top level (age_seconds, interval, error, refreshing, agents_*, stats_*).
export type FeedState<T = unknown> = {
  data: T | null;
  ageSeconds: number | null;
  interval: number;
  error: string | null;
  refreshing: boolean;
  fetchedAt: number | null;
};


export type HistRow = Record<string, unknown>;
export type UsageRow = Record<string, unknown>;
export type RoutineList = Record<string, unknown>;
export type RoutineRun = Record<string, unknown>;
export type Memory = Record<string, unknown>;
// /api/routines/summary, read for an admin only: teams maps a team to its routine count and failed count.
export type RoutineSummary = { teams: Record<string, { routines?: number; failed?: number | boolean; [k: string]: unknown }>; routines?: Record<string, unknown> };

export type TailState = 'connecting' | 'running' | 'waiting' | 'error';

export type Theme = 'system' | 'light' | 'dark';

export type StatsFilter = {
  range: string;
  from: string;
  to: string;
  src: string;
  kind: string;
  model: string;
  team: string;
  q: string;
};

// The v1 localStorage keys and value shapes, so a person keeps their settings.
export type Prefs = {
  theme: Theme;
  keys: boolean;
  pipeTeam: string;
  sowner: string;
  panelW: { '--side'?: number; '--right'?: number };
  noside: boolean;
  noright: boolean;
  sx: { term: boolean };
  statsFilter: StatsFilter;
};

export type Store = {
  conn: { mode: ConnMode; lastEventAt: number; seq: string | null; error?: string };
  viewer: Viewer;
  feeds: Partial<Record<FeedName, FeedState>>;
  // Replaces the v1 AGENTS.sessions, FRESH and overlay(): one merged list.
  sessions: { byKey: Record<string, Session>; order: string[] };
  tails: Record<string, { lines: string[]; state: TailState; at: number }>;
  history: Record<string, { rows: HistRow[]; at: number; error?: string }>;
  usage: Record<string, { models: UsageRow[]; at: number; error?: string }>;
  teamsUi: {
    routines: Record<string, RoutineList>;
    routineHist: Record<string, RoutineRun[]>;
    memory: Record<string, Memory>;
    summary: { data: RoutineSummary | null; error: string; at: number };
  };
  flow: { points: FlowPoint[] };
  route: Route;
  prefs: Prefs;
};
