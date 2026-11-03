// C1, the /api/live event schema: the TS side. dashboard/live_schema.py is the Python side; schema.test.ts
// fails when the field names in SPECS differ from what `live_schema.py --dump` prints.
// The guards ignore a field they do not name, so a new server field does not stop the page.

type Check = (v: unknown) => boolean;
type Spec = { required: Record<string, Check>; optional: Record<string, Check> };

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isNull = (v: unknown): v is null => v === null;
const isAny: Check = () => true;
export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const or = (...cs: Check[]): Check => (v) => cs.some((c) => c(v));
const listOf = (c: Check): Check => (v) => Array.isArray(v) && v.every(c);
const dictOf = (c: Check): Check => (v) => isObj(v) && Object.values(v).every(c);
const oneOf = (...xs: unknown[]): Check => (v) => xs.includes(v);
const fits = (s: Spec): Check => (v) =>
  isObj(v) &&
  Object.entries(s.required).every(([k, c]) => k in v && c(v[k])) &&
  Object.entries(s.optional).every(([k, c]) => !(k in v) || c(v[k]));

export type Viewer = { user: string | null; admin: boolean; teams: string[] };
export type Hello = { v: 1; epoch: string; sid: string; viewer: Viewer; retention_s: number; max_life_s: number };
// name is the server Feed name: snapshot, agents, teams, snapshot:<team>, team-test:<team>.
export type FeedFrame = {
  name: string;
  data?: unknown; // left out when only the error, the age or refreshing changed
  age_seconds: number | null;
  interval: number;
  error: string | null;
  refreshing: boolean;
  fetched_at: number | null;
};

// The v1 fields that /api/snapshot sends after the SESSION_UNUSED drop. Other v1 fields can come too.
const SESSION_ANY = [
  'base', 'boot_backend', 'boot_s', 'boot_steps', 'booted_at', 'branch', 'busy_s', 'compute_usd', 'finish_notes',
  'fix_actor', 'fix_head_sha', 'fix_pr', 'fix_trigger', 'handoff', 'idle_s', 'jira', 'jira_drafts', 'last_text',
  'last_tool', 'mcp', 'new', 'owner', 'owner_name', 'pr_url', 'pushed_branch', 'request', 'res_peak', 'resume_from',
  'routine_draft', 'routine_name', 'routine_run', 'runner_left', 'runner_s', 'runtime', 'slack_url', 'source',
  'stack_fails', 'stack_s', 'stack_starts', 'stop_reason', 'stopped_at', 'summary', 'thread', 'turn_open', 'turns',
  'untrusted', 'verify_fail_runs', 'verify_full', 'verify_runs', 'verify_s', 'wrap_mode', 'wrap_reply',
] as const;
export type Session = {
  key: string;
  agent?: Record<string, unknown> | null;
  agent_alive?: boolean;
  created?: number;
  fix_run?: boolean;
  last_activity?: number;
  media?: unknown[];
  profile?: string;
  state?: string;
} & { [K in (typeof SESSION_ANY)[number]]?: unknown } & { [field: string]: unknown };

export type Resolved = { at: string; note: string | null };
// One open or closed signature, as `fxa-sandbox-ctl errors --json` gives it.
export type ErrorRow = {
  sig: string; source: string; kind: string; status: string; message: string; where: string | null; log: string | null;
  count: number; first: string; last: string; keys: string[]; resolved: Resolved | null;
};
// stops holds 9 counts, in the LANE_ST order.
export type FlowPoint = { at: number; stops: number[]; merged: number; closed: number };
// stats is always null: the client reads GET /api/stats?inproc=1 once, then applies the stats frames.
export type Snapshot = { feeds: Record<string, FeedFrame>; sessions: Session[]; errors: ErrorRow[]; stats: null; flow: FlowPoint[] };

export const TABLES = ['sessions', 'errors', 'history', 'routines', 'routine_runs', 'routine_tick', 'team_audit'] as const;
export type Table = (typeof TABLES)[number];
// The field that names a row of each delta table; delta.deleted holds these values as text.
export const DELTA_KEY: Record<Table, string> = {
  sessions: 'key', errors: 'sig', history: 'key', routines: 'id', routine_runs: 'routine_id', routine_tick: 'env', team_audit: 'team',
};
export type Delta = { tbl: Table; rows: Record<string, unknown>[]; deleted: string[] };

// The parts of /api/stats that a stats frame sends whole when they change. rows grows by rows_add.
export const STATS_PARTS = [
  'prs', 'prs_at', 'llm', 'load', 'pipeline', 'memory', 'tickets', 'kinds', 'models', 'ranges', 'team_passes', 'top', 'weeks',
] as const;
// base is the ETag of the copy this frame applies to, etag the ETag after it. reload: a past row changed, so fetch it all.
export type StatsFrame = { base: string; etag: string; reload?: true; rows_add?: Record<string, unknown>[] } & {
  [K in (typeof STATS_PARTS)[number]]?: unknown;
};
// start is the index of lines[0] in the 200-line window.
export type Tail = { key: string; start: number; lines: string[] };
export type Reset = { reason: string };
export type Ping = { at: number };
export type Bye = { reason: 'max_life' | 'shutdown' | 'full' | 'off'; retry_s?: number };

export type EventMap = {
  hello: Hello; snapshot: Snapshot; feed: FeedFrame; delta: Delta; stats: StatsFrame; tail: Tail;
  flow: FlowPoint; reset: Reset; ping: Ping; bye: Bye;
};
export type EventName = keyof EventMap;
// Only the events that the hub keeps in its ring have an id; hello, ping, reset and bye belong to one stream.
export type Frame = { [E in EventName]: { event: E; data: EventMap[E]; id?: string } }[EventName];

const viewer: Spec = { required: { user: or(isStr, isNull), admin: isBool, teams: listOf(isStr) }, optional: {} };
const resolved: Spec = { required: { at: isStr, note: or(isStr, isNull) }, optional: {} };
const session: Spec = {
  required: { key: isStr },
  optional: {
    ...Object.fromEntries(SESSION_ANY.map((k) => [k, isAny])),
    agent: or(isObj, isNull), agent_alive: isBool, created: isNum, fix_run: isBool, last_activity: isNum,
    media: listOf(isAny), profile: isStr, state: isStr,
  },
};
const error: Spec = {
  required: {
    sig: isStr, source: isStr, kind: isStr, status: isStr, message: isStr, where: or(isStr, isNull), log: or(isStr, isNull),
    count: isInt, first: isStr, last: isStr, keys: listOf(isStr), resolved: or(isNull, fits(resolved)),
  },
  optional: {},
};
const feed: Spec = {
  required: {
    name: isStr, age_seconds: or(isInt, isNull), interval: isInt, error: or(isStr, isNull), refreshing: isBool, fetched_at: or(isNum, isNull),
  },
  optional: { data: isAny },
};
const flow: Spec = { required: { at: isInt, stops: (v) => listOf(isInt)(v) && (v as unknown[]).length === 9, merged: isInt, closed: isInt }, optional: {} };
const listOfObj = listOf(isObj);

export const SPECS = {
  hello: {
    required: { v: oneOf(1), epoch: (v) => isStr(v) && /^[A-Za-z0-9]{1,32}$/.test(v), sid: isStr, viewer: fits(viewer), retention_s: isInt, max_life_s: isInt },
    optional: {},
  },
  snapshot: {
    required: {
      feeds: dictOf((v) => fits(feed)(v) && isObj(v) && 'data' in v), sessions: listOf(fits(session)), errors: listOf(fits(error)),
      stats: isNull, flow: listOf(fits(flow)),
    },
    optional: {},
  },
  feed,
  delta: {
    required: { tbl: oneOf(...TABLES), rows: listOfObj, deleted: listOf(isStr) },
    optional: {},
  },
  stats: {
    required: { base: isStr, etag: isStr },
    optional: {
      reload: oneOf(true), rows_add: listOfObj, prs: listOfObj, prs_at: isNum, llm: isObj, load: isObj, pipeline: isObj, memory: isObj,
      tickets: isObj, kinds: listOf(isAny), models: listOf(isAny), ranges: isObj, team_passes: isObj, top: listOf(isAny), weeks: listOf(isAny),
    },
  },
  tail: { required: { key: isStr, start: isInt, lines: listOf(isStr) }, optional: {} },
  flow,
  reset: { required: { reason: isStr }, optional: {} },
  ping: { required: { at: isInt }, optional: {} },
  bye: { required: { reason: oneOf('max_life', 'shutdown', 'full', 'off') }, optional: { retry_s: isInt } },
  Viewer: viewer,
  Session: session,
  Error: error,
  Resolved: resolved,
} satisfies Record<EventName | 'Viewer' | 'Session' | 'Error' | 'Resolved', Spec>;

const RING: ReadonlySet<string> = new Set(['snapshot', 'feed', 'delta', 'stats', 'tail', 'flow']);
const ID = /^[A-Za-z0-9]{1,32}-[0-9]+$/;

// The rules that a field check cannot say.
function rulesHold(e: EventName, d: Record<string, unknown>): boolean {
  if (e === 'stats' && d.reload) return Object.keys(d).every((k) => k === 'base' || k === 'etag' || k === 'reload');
  if (e !== 'delta') return true;
  const tbl = d.tbl as Table, rows = d.rows as Record<string, unknown>[];
  const shape = tbl === 'sessions' ? session : tbl === 'errors' ? error : null;
  return rows.every((r) => DELTA_KEY[tbl] in r && (!shape || fits(shape)(r)) && (tbl !== 'history' || Object.keys(r).length === 1));
}

export function isFrame(f: unknown): f is Frame {
  if (!isObj(f) || !isStr(f.event) || !(f.event in SPECS) || /^[A-Z]/.test(f.event)) return false;
  const e = f.event as EventName;
  if (RING.has(e) !== 'id' in f || ('id' in f && !(isStr(f.id) && ID.test(f.id)))) return false;
  return fits(SPECS[e])(f.data) && rulesHold(e, f.data as Record<string, unknown>);
}

// One ndjson line, or one SSE frame as {id, event, data}; throws on a frame that breaks C1.
export function parseFrame(line: string): Frame {
  const f: unknown = JSON.parse(line);
  if (!isFrame(f)) throw new TypeError(`not a C1 frame: ${line.slice(0, 120)}`);
  return f;
}
