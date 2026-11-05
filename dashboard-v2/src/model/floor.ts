// The floor (pool slots and live sessions), Needs you and the Sandboxes list, ported from the retired v1 dashboard.
import { short } from '../format';

import { AGENTS, type J, KEY_RE, LANE_ST, LIVE_SESSION, SS, STATE, TEAM_ADMIN, memo } from './base';
import { SNAP, beltGroups, boardState, merged, pipe, stopName, strayRun, strays } from './pipeline';
import { ageOf, convTitle, fixLabel, isFix, ownerName, sessHref, sessTabOf, sessUsd } from './sessions';

const agentsStale = (st: J) => !!(st.agents_age_seconds != null && st.agents_interval && st.agents_age_seconds > 3 * st.agents_interval);

// A row per pool slot and live session; a non-admin sees a routine run only as a scheduled run.
export const floorRows = memo((s) => [STATE(s), AGENTS(s), pipe(s), s.feeds.stats, s.sessions, s.viewer, beltGroups(s), merged(s)], (s): J => {
  const g = AGENTS(s), st = STATE(s), stale = agentsStale(st), admin = !!TEAM_ADMIN(s).admin;
  if (!g || st.agents_error) return { unknown: true, stale, rows: [], slots: 0, admin };
  const bg = beltGroups(s), rowBy = new Map(['working', 'needs', 'fixes', 'review'].flatMap((k) => bg[k]).map((r: J) => [r.t.key, r]));
  // free_slots null: the slot read failed, so an empty slot is unknown, never a confident free.
  const cards = new Map(merged(s).cards.filter((c) => !c.ci).map((c) => [c.name, c])), known = Array.isArray(g.free_slots), free = new Set(g.free_slots ?? []);
  const rows: J[] = [], pool: J[] = g.pool ?? [];
  // A runner that no pool slot holds (another pool, a hand-started run) still gets its row.
  const slots = pool.map((p) => ({ slot: p.slot, c: p.agent ? cards.get(p.agent) : null, agent: p.agent }))
    .concat([...cards.values()].filter((c) => !pool.some((p) => p.agent === c.name)).map((c) => ({ slot: '', c, agent: undefined })));
  slots.forEach((p) => {
    const c = p.c;
    if (!c) return rows.push({ kind: 'free', slot: p.slot, state: !known ? 'unknown' : free.has(p.slot) ? 'free' : 'held' });
    const r = rowBy.get(c.key), stop = r?.st ?? 2, a = c.agent || {}, exited = !c.agent_alive && c.stage === 'watching' && !c.handoff;
    const fault = c.stage === 'stalled' ? 'stalled' : c.stage === 'error' ? 'run failed' : exited ? 'agent exited' : '';
    const idle = c.agent_alive && (a.idle_seconds ?? 0) >= 600 ? `idle ${Math.floor(a.idle_seconds / 60)} min` : '';
    rows.push({ kind: 'pipe', key: c.key, slot: p.slot, name: c.name, age: c.elapsed_seconds ?? null, team: c.profile || SNAP(s)?.team?.profile || '', title: c.summary || c.branch || '', st: stop, fault, idle, alive: c.agent_alive && !fault,
      time: short(c.elapsed_seconds), cost: a.cost_so_far, href: KEY_RE.test(c.key ?? '') ? `#pipeline/belts/${encodeURIComponent(c.key)}` : '' });
  });
  const extra = (g.free_slots ?? []).filter((f: J) => !pool.some((p) => p.slot === f));
  extra.forEach((f: J) => rows.push({ kind: 'free', slot: f, state: 'free' }));
  SS(s).filter((x) => LIVE_SESSION.includes(x.state as string)).forEach((x: J) => {
    const routine = !!x.routine_run, open = admin || !routine;
    rows.push({ kind: routine ? 'routine' : 'slack', key: x.key, depfix: isFix(x) ? fixLabel(x, admin) : '', team: open ? x.profile || 'fxa' : '', title: open ? convTitle(s, x) : '', alive: !!x.agent_alive, waits: !x.agent_alive ? (open ? ownerName(s, x) : 'its owner') : '',
      turns: x.turns, time: ageOf(x.created), cost: open ? sessUsd(s, x) : null, href: open && sessHref(x.key) ? `#sessions/${sessTabOf(x)}/${x.key}` : '',
      where: x.boot_backend === 'gce' ? 'gce' : x.boot_backend === 'firecracker' ? 'firecracker' : null, boot_s: x.boot_s ?? null, boot_steps: x.boot_steps ?? null, res_peak: x.res_peak ?? null, started: x.created ?? null });
  });
  return { rows, stale, unknown: false, slots: slots.length + extra.length, admin };
});

// The Overview floor: unknown on a failed or stale feed, else the rows with the agent's last output line.
export const ovFloor = memo((s) => [floorRows(s)], (s): J => {
  const f = floorRows(s);
  if (f.unknown || f.stale) return { unknown: true, stale: f.stale, atWork: 0, tiles: [] };
  const cards = new Map(merged(s).cards.map((c) => [c.name, c])), ss = new Map(SS(s).map((x) => [x.key, x]));
  const tiles = f.rows.map((t: J) => {
    if (t.kind === 'pipe') { const a = cards.get(t.name)?.agent || {}; return { ...t, out: a.last_tool || a.last_text || '' }; }
    if (t.kind === 'free') return t;
    const x: J = ss.get(t.key), open = f.admin || t.kind !== 'routine';
    return { ...t, out: open ? (x?.agent?.last_tool || x?.agent?.last_text || '') : '' };
  });
  return { tiles, atWork: tiles.filter((t: J) => t.kind !== 'free' && t.alive).length, slots: f.slots, admin: f.admin };
});

// "fxa-auto-4, 5, 6": a run of slot names with one prefix shows the prefix once.
export function slotList(l: unknown[]): string {
  const m = l.map((x) => String(x).match(/^(.*?)(\d+)$/)), pre = m[0]?.[1];
  return l.length > 1 && m.every((x) => x && x[1] === pre) ? [l[0], ...m.slice(1).map((x) => x![2])].join(', ') : l.join(', ');
}

// Needs you: unknown says why the count is unknown, never a confident zero.
export const ovNeeds = memo((s) => [beltGroups(s), merged(s), strays(s)], (s): J => {
  const bg = beltGroups(s), belts = new Set(bg.needs.map((r: J) => r.t.key)), sandbox = new Set<string>();
  merged(s).cards.forEach((c) => { if (!c.ci && (c.base_ok === false || c.agent?.num_turns === 0) && !belts.has(c.key)) sandbox.add(c.key); });
  strays(s).forEach((v) => sandbox.add(v.name));
  const by: Record<string, number> = {};
  bg.needs.forEach((r: J) => { const p = r.item?.person ?? 'the operator'; by[p] = (by[p] ?? 0) + 1; });
  return { total: belts.size + sandbox.size, sandbox: sandbox.size, by, unknown: bg.unknown.needs || boardState(s, 'running') };
});

// A sandbox is up only while its instance runs; GCE moves an instance through the short states below.
export const instUp = (v: J) => v.state === 'running';
export const instMoving = (v: J) => !!v && ['provisioning', 'staging', 'stopping', 'suspending'].includes(v.state);
export const movingWord = (v: J) => (['stopping', 'suspending'].includes(v.state) ? 'stopping' : 'starting');
export const SB_GRACE = 600;
// The one source of a stop command: a fresh feed, and a name that passes stopName() (an instance's run name first).
export function fixCmd(row: J, stale: boolean): string | null {
  const t = row?.fix?.target; if (stale || !t) return null;
  const name = row.fix.kind === 'instance' ? strayRun(t) : t;
  return stopName(name) ? `fxa-sandbox-ctl stop ${name}` : null;
}

// One list of every sandbox, built on the floor rows. A fix row bills with no run, or holds a slot no run uses.
export const sbRows = memo((s) => [floorRows(s), STATE(s), AGENTS(s), pipe(s), s.feeds.stats, s.sessions, strays(s)], (s): J => {
  const g = AGENTS(s), fr = floorRows(s), stale = fr.stale || fr.unknown, out: J = { live: [], fix: [], free: [], unknown: [], stale, err: null, sessionFree: null };
  const st = STATE(s), snap = SNAP(s);
  if (fr.unknown) { out.err = g ? st.agents_error || 'the agents feed could not be read' : null; return out; }
  const now = Date.now() / 1000, admin = fr.admin, ss = SS(s) as J[], byKey = new Map(ss.map((x) => [x.key, x]));
  const inst: J[] = g.instances ?? [], instBy = new Map(inst.map((v) => [v.name, v])), pool: J[] = g.pool ?? [];
  const base = { slot: '', key: '', depfix: '', title: '', team: '', where: null, started: null, age: null, cap: null, max_seconds: null, cost: null, usd: null, session: null, pr: null, routine_run: null, routine_name: null, boot_s: null, boot_steps: null, res_peak: null, fault: '', fix: null };
  const withFix = (row: J, fix: J) => { const r = { ...row, fix }; r.fix.cmd = fixCmd(r, stale); return r; };
  fr.rows.filter((t: J) => t.kind !== 'free').forEach((t: J) => {
    if (t.kind === 'pipe') {
      const v = instBy.get(`agent-${t.name}`), cap = v?.max_seconds ?? null;
      return out.live.push({ ...base, id: `pipe:${t.slot || t.key}`, src: 'pipeline', slot: t.slot || '', key: t.key, title: t.title, team: t.team, where: 'gce',
        state: instMoving(v) ? movingWord(v) : t.fault || t.idle || `Stop ${t.st + 1} of 9, ${LANE_ST[t.st]}`, fault: t.fault || t.idle || '', age: t.age ?? null, cap, max_seconds: cap, cost: t.cost ?? null, usd: t.cost ?? null });
    }
    const x = byKey.get(t.key), open = admin || t.kind !== 'routine', v = instBy.get(`agent-${t.key}`);
    out.live.push({ ...base, id: `sess:${t.key}`, src: t.kind, key: t.key, depfix: t.depfix, title: t.title, team: t.team, where: t.where, started: t.started, state: instMoving(v) ? movingWord(v) : t.waits ? `waits on ${t.waits}` : 'working',
      age: t.started ? Math.max(0, Math.round(now - t.started)) : null, cap: g.session_max_run_seconds ?? null, cost: t.cost ?? null, usd: t.cost ?? null, session: t.key,
      routine_run: x?.routine_run ?? null, routine_name: open ? x?.routine_name ?? null : null, boot_s: t.boot_s, boot_steps: t.boot_steps, res_peak: t.res_peak });
  });
  // A stopped session whose runner is up: 'stopping' in the stop window, else a fix row.
  const known = new Set<string>();
  ss.filter((x) => !LIVE_SESSION.includes(x.state)).forEach((x) => {
    const v = instBy.get(`agent-${x.key}`); if (!v || !(instUp(v) || instMoving(v))) return;
    known.add(v.name);
    const routine = !!x.routine_run, open = admin || !routine, since = x.stopped_at ? now - x.stopped_at : null;
    const row: J = { ...base, src: routine ? 'routine' : 'slack', key: x.key, depfix: isFix(x) ? fixLabel(x, admin) : '', title: open ? convTitle(s, x) : '', team: open ? x.profile || 'fxa' : '',
      where: x.boot_backend === 'gce' ? 'gce' : x.boot_backend === 'firecracker' ? 'firecracker' : v.where === 'firecracker' ? 'firecracker' : 'gce',
      started: x.created ?? null, age: v.age_seconds ?? null, cap: v.max_seconds ?? null, cost: open ? sessUsd(s, x) : null, session: x.key, routine_run: x.routine_run ?? null, routine_name: open ? x.routine_name ?? null : null,
      boot_s: x.boot_s ?? null, boot_steps: x.boot_steps ?? null, res_peak: x.res_peak ?? null };
    row.usd = row.cost;
    // No stopped_at (a failed boot, a job that died): nothing will stop the runner, so it is a fix at once.
    if (instUp(v) && ((String(x.runner_left) === '1' && since != null && since >= 300) || since == null || since >= SB_GRACE))
      out.fix.push(withFix({ ...row, id: `fix:${v.name}`, state: 'stopped, runner still up' }, { kind: 'session', target: x.key, steps: null,
        why: `The session ${x.state}${since != null ? ` ${short(Math.round(since))} ago` : ''}, and its runner still bills. Stop it: the stop saves the work.` }));
    else out.live.push({ ...row, id: `sess:${x.key}`, state: 'stopping' });
  });
  // A stopped instance, or one with no run behind it. One whose run name a pool slot says it runs is unknown.
  const stray = new Set(strays(s)), slotAgents = new Set(pool.map((p) => p.agent).filter(Boolean)), pipeNames = new Set(fr.rows.filter((t: J) => t.kind === 'pipe').map((t: J) => t.name));
  inst.filter((v) => !known.has(v.name) && (!instUp(v) || stray.has(v))).forEach((v) => {
    const run = strayRun(v.name);
    // On its way up or down with no run behind it: no command until GCE says where it went.
    if (instMoving(v)) return byKey.has(run) || pipeNames.has(run) || slotAgents.has(run) || (v.age_seconds != null && v.age_seconds <= 120) ? undefined
      : out.unknown.push({ slot: v.name, why: `${v.name} is ${v.state}, with no run behind it` });
    if (run && slotAgents.has(run)) return out.unknown.push({ slot: v.name, why: `${v.name}: the slot says it runs, but the agents feed has no run row` });
    out.fix.push(withFix({ ...base, id: `fix:${v.name}`, src: byKey.has(run) ? 'slack' : 'pipeline', key: v.name, where: v.where === 'firecracker' ? 'firecracker' : 'gce', state: v.state, age: v.age_seconds ?? null },
      { kind: 'instance', target: v.name, steps: stopName(run) ? null : 'Its name is not a runner name: delete it in the GCE console.', why: `${v.state} with no run behind it (${short(v.age_seconds)} old); it bills until deleted.` }));
  });
  // A slot that is not free and has no agent is a fix row only when every read behind it worked and is fresh.
  const inflight = new Set((snap?.inflight ?? []).map((t: J) => t.key));
  // ponytail: the snapshot interval from the feed, 300 s when it is missing.
  const ms = (t: J) => (typeof t === 'number' ? t * 1000 : Date.parse(t));
  const snapFresh = ms(snap?.generated_at) >= ms(g.generated_at) - (st.interval || 300) * 1000;
  fr.rows.filter((t: J) => t.kind === 'free').forEach((t: J) => {
    if (t.state === 'free') return out.free.push({ slot: t.slot });
    if (t.state === 'unknown') return out.unknown.push({ slot: t.slot, why: `${t.slot}: slots unknown: the slot read failed` });
    const p = pool.find((q) => q.slot === t.slot) ?? {}, k = p.key ?? '';
    if (!KEY_RE.test(k)) return out.unknown.push({ slot: t.slot, why: `${t.slot} is not free for a launch (branch ${p.branch ?? 'none'})` });
    if (!snap || snap.inflight_fetch_failed) return out.unknown.push({ slot: t.slot, why: `${t.slot} held by ${k} · in flight unknown: the Jira read failed` });
    if (!snapFresh) return out.unknown.push({ slot: t.slot, why: `${t.slot} held by ${k} · in flight not checked yet` });
    if (inflight.has(k)) return out.free.push({ slot: t.slot, held: k });
    out.fix.push(withFix({ ...base, id: `held:${t.slot}`, src: 'pipeline', slot: t.slot, key: k, where: 'gce', state: 'not free for a launch' },
      { kind: 'slot', target: null, steps: `Run fxa-sandbox-ctl slots on the manager to find the ${t.slot} worktree, and look at git status there. Save or drop the changes, and the slot is free on the next poll.`,
        why: `${t.slot} is not free for a launch. Its last ticket ${k} is not in flight.` }));
  });
  const nSess = out.live.filter((x: J) => x.src !== 'pipeline' && x.state !== 'stopping').length;
  out.sessionFree = g.session_cap != null ? Math.max(0, g.session_cap - nSess) : null;
  return out;
});

// The rail badge: the fix rows, with words a screen reader says; '?' when the page cannot tell.
export const sbBadge = memo((s) => [sbRows(s), s.feeds.agents], (s): { n: number | string; tone: string; label: string } => {
  if (!AGENTS(s)) return { n: '', tone: '', label: '' };
  const r = sbRows(s);
  if (r.err || r.stale || r.unknown.length) return { n: '?', tone: 'warn', label: 'Sandbox fixes unknown: the agents feed could not be read' };
  const n = r.fix.length;
  return n ? { n, tone: 'warn', label: `${n} sandbox${n === 1 ? ' needs' : 'es need'} a fix` } : { n: '', tone: '', label: '' };
});
