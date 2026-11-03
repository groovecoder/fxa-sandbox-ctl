// C2, the store shape. W1-DATA fills the store; the shell and the views read it through selectors.
import type { Route } from '../router/types';

export type ConnMode = 'connecting' | 'live' | 'polling' | 'offline' | 'signin';

export type FeedName = 'full' | 'agents' | 'stats' | 'teams' | 'errors' | 'overview' | `team:${string}`;

// The fields come from the snapshot top level (age_seconds, interval, error, refreshing, agents_*, stats_*).
export type FeedState<T = unknown> = {
  data: T | null;
  ageSeconds: number | null;
  interval: number;
  error: string | null;
  refreshing: boolean;
  fetchedAt: number | null;
};

// The v1 session fields keep their names. Only the fields that the merge rule reads are named here.
export type Session = {
  key: string;
  created?: number;
  last_activity?: number;
  state?: string;
  profile?: string;
  agent?: Record<string, unknown> | null;
  agent_alive?: boolean;
  deleted?: boolean;
  [field: string]: unknown;
};

export type HistRow = Record<string, unknown>;
export type UsageRow = Record<string, unknown>;
export type RoutineList = Record<string, unknown>;
export type RoutineRun = Record<string, unknown>;
export type Memory = Record<string, unknown>;

// One count of the belts at each of the 9 stops, in the LANE_ST order (section 4.4 of the design).
export type FlowPoint = { at: number; stops: number[]; merged: number; closed: number };

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
  viewer: { user?: string; admin: boolean; teams: string[] };
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
  };
  flow: { points: FlowPoint[] };
  route: Route;
  prefs: Prefs;
};
