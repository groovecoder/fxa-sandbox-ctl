// The Routines tab of a team page: the list, a routine's page with its runs, and the form (section 6.7).
import { useCallback, useEffect, useRef, useState } from 'react';
import { getJson, postJson } from '../../../live/api';
import type { J } from '../../../model/base';
import { rtAdmin } from '../../../model/teams';
import { readRoutineHist, readRoutines, store, useApp } from '../../../store';
import { Card } from '../../../ui';
import { Detail } from './Detail';
import { Form } from './Form';
import { List } from './List';
import { focusLater } from './parts';
import { type Chans, RT_BLANK, RT_CHANS_S, RT_WITHIN_MIN, type Start, rtChName, rtDraft, rtErrs, rtFirstErr, rtFromTpl, rtList, rtRoutine, rtStarts } from './rt';

export type FormState =
  | { step: 1 }
  | { step: 2; id?: number; version?: number; d: J; errs: Record<string, string>; saving?: boolean; promptOpen?: boolean; chPaste?: boolean };
export type Ask = { id: number; url: string; err: string; asking: boolean };
export type Act = 'new' | 'tpl' | 'back' | 'cancel' | 'save' | 'edit' | 'hist' | 'run' | 'askcancel' | 'runpr' | 'stop' | 'pause' | 'resume' | 'delete';
export type Ctl = {
  team: J; list: J[]; limit: number; sum: J; tpls: Start[] | null; chans: Chans | null; now: number;
  busy: number | null; arm: number | null; ask: Ask | null; histErr: Record<string, string>;
  form: FormState | null; setForm: (f: (x: FormState | null) => FormState | null) => void;
  setAskUrl: (url: string) => void; act: (a: Act, id?: string | number, extra?: string) => void;
};

const enc = encodeURIComponent;
// The templates are the same for every team: one read per page load, again only after a failure.
let TPLS: Promise<Start[]> | null = null;
const loadTpls = () => (TPLS ??= getJson<Start[]>('/api/routine-templates').then((g) => {
  if ('data' in g && Array.isArray(g.data)) return g.data;
  TPLS = null;
  return [];
}));
// The channels the bot is in come from a ctl command (about 1 s), so they load again only after RT_CHANS_S.
const CHANS: Record<string, { at: number; got: Promise<Chans> }> = {};
const loadChans = (team: string) => {
  const c = CHANS[team];
  if (c && c.at > Date.now() - RT_CHANS_S * 1000) return c.got;
  const got = getJson<Chans>(`/api/teams/${enc(team)}/routine-channels`).then((g) => {
    if ('data' in g && Array.isArray(g.data?.channels)) return g.data;
    delete CHANS[team];
    return { channels: [], err: 'error' in g ? g.error : 'the channel list did not load' };
  });
  CHANS[team] = { at: Date.now(), got };
  return got;
};

export function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function RoutinesTab({ team }: { team: J }) {
  const admin = useApp((s) => rtAdmin(s, team.profile));
  if (!admin) return <Card><p className="m-0">Only a team admin can see and change routines.</p></Card>;
  // A team change starts with no open form, message or selection.
  return <Routines key={team.profile} team={team} />;
}
export default RoutinesTab;

function Routines({ team }: { team: J }) {
  const p: string = team.profile, base = `/api/teams/${enc(p)}/routines`;
  const raw = useApp((s) => s.teamsUi.routines[p]);
  const { list, limit } = rtList(raw);
  const rid = useApp((s) => s.route.rid);
  const sum = useApp((s) => s.teamsUi.summary.data);
  const live = useApp((s) => s.conn.mode === 'live');
  const now = useNow(30000);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [arm, setArm] = useState<number | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [histErr, setHistErr] = useState<Record<string, string>>({});
  const [tpls, setTpls] = useState<Start[] | null>(null);
  const [chans, setChans] = useState<Chans | null>(null);
  const saving = useRef(false);

  const load = useCallback(async () => {
    const g = await readRoutines(p);
    if (g) setErr('error' in g ? g.error : '');
  }, [p]);
  useEffect(() => {
    let on = true;
    void load();
    void loadTpls().then((x) => on && setTpls(x));
    void loadChans(p).then((x) => on && setChans(x));
    return () => { on = false; };
  }, [load, p]);
  // The stream reads the list again on each routine delta; without it, the list polls as v1 did.
  useEffect(() => {
    if (live) return;
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [live, load]);

  const sel = !form && rid && list ? list.find((r) => String(r.id) === rid) ?? null : null;
  const selId = sel ? String(sel.id) : '';
  const hasHist = useApp((s) => !!selId && !!s.teamsUi.routineHist[selId]);
  const loadHist = useCallback(async (id: string) => {
    setHistErr((e) => { const { [id]: _, ...rest } = e; void _; return rest; });
    const g = await readRoutineHist(p, id);
    if (g && 'error' in g) setHistErr((e) => ({ ...e, [id]: g.error }));
  }, [p]);
  // The open routine's runs load once its page shows; the stream reads them again on each run delta.
  useEffect(() => {
    if (selId && !hasHist) void loadHist(selId);
  }, [selId, hasHist, loadHist]);

  // A message takes the focus only when the focused control is gone or off.
  const say = (text: string, ok: boolean) => { setMsg({ text, ok }); focusLater('rt-msg', true); };
  const row = (x: unknown) => rtList(store.getState().teamsUi.routines[p]).list?.find((r) => String(r.id) === String(x));
  const go = (id?: number) => { location.hash = `#teams/${p}/routines${id ? `/${id}` : ''}`; };

  async function act(a: Act, id?: string | number, extra?: string) {
    const head = () => { focusLater('rt-form-h'); };
    if (a === 'new') { setForm({ step: 1 }); setMsg(null); return head(); }
    if (a === 'tpl') {
      const x = rtStarts(tpls).find((s) => s.template === id) ?? RT_BLANK;
      setForm({ step: 2, d: rtFromTpl(x, team.repos ?? []), errs: {} }); setMsg(null); return head();
    }
    if (a === 'back') { setForm({ step: 1 }); return head(); }
    if (a === 'cancel') { setForm(null); return; }
    if (a === 'save') {
      // A second click while the first save is on its way must not create a second routine.
      if (!form || form.step !== 2 || saving.current) return;
      saving.current = true;
      const f = form;
      setForm({ ...f, saving: true });
      const g = await postJson<J>(f.id ? `${base}/${f.id}` : base, { routine: rtRoutine(f.d), ...(f.id ? { version: f.version } : {}) });
      saving.current = false;
      if ('data' in g) {
        const nid = f.id ?? (Number(String(g.data?.out ?? '').match(/created routine (\d+)/)?.[1]) || null);
        setForm(null);
        await load();
        if (nid) go(nid);
        if (extra === 'run' && nid) {
          const q = await postJson<J>(`${base}/${nid}/run`, {});
          await load();
          return say('data' in q ? `Created, and queued. It starts when a runner is free, within ${RT_WITHIN_MIN} min.` : `Created, but Run now did not start: ${q.error}`, 'data' in q);
        }
        return say(g.data?.out || 'saved', true);
      }
      if (g.status === 409) {
        // Keep the draft and take the current version, so a second Save replaces their change on purpose.
        await load();
        const cur = row(f.id);
        setForm({ ...f, saving: false, errs: {}, version: cur ? cur.version : f.version });
        return say(`Someone changed this routine since you opened it.${cur ? ' Save again to replace their change with yours, or Cancel and Edit to see theirs.' : ' It is gone.'}`, false);
      }
      const { errs, summary } = rtErrs(g.error);
      setForm({ ...f, saving: false, errs, promptOpen: f.promptOpen || !!errs.prompt });
      say(summary, false);
      const first = rtFirstErr(errs);
      if (first) focusLater(`rt-${first}`);
      return;
    }
    const r0 = row(id);
    if (!r0) return;
    const rn = Number(r0.id);
    if (a === 'edit') { setForm({ step: 2, id: rn, version: r0.version, d: rtDraft(r0.data), errs: {} }); setMsg(null); return head(); }
    if (a === 'hist') return void loadHist(String(rn));
    if (a === 'run' && r0.data.on === 'pr-label') { setAsk({ id: rn, url: '', err: '', asking: false }); setMsg(null); focusLater(`rt-ask-${rn}`); return; }
    if (a === 'askcancel') { setAsk(null); return; }
    if (a === 'runpr') {
      if (!ask || ask.asking || ask.id !== rn) return;
      setAsk({ ...ask, asking: true, err: '' });
      const q = await postJson<J>(`${base}/${rn}/run`, { pr: ask.url.trim() });
      if (!('data' in q)) { setAsk({ ...ask, asking: false, err: String(q.error || q.status).replace(/^ERROR: /, '') }); focusLater(`rt-ask-${rn}`); return; }
      setAsk(null);
      await load();
      void loadHist(String(rn));
      return say(String(q.data?.out ?? '').replace(/^queued run \d+: /, '') || 'Queued.', true);
    }
    if (a === 'delete' && arm !== rn) { setArm(rn); return say(`Delete ${r0.data.name}? Click Delete again. You cannot undo this.`, false); }
    if (busy != null) return;
    setArm(null); setBusy(rn);
    // Stop names the run the page shows, so a second live run is never the one that stops.
    const g = await postJson<J>(`${base}/${rn}/${a}`, a === 'stop' && extra ? { run: Number(extra) } : {});
    setBusy(null);
    if ('data' in g && a === 'delete') go();
    await load();
    if ('data' in g && (a === 'run' || a === 'stop')) void loadHist(String(rn));
    // A pause or resume moves the version: the admin's own open edit of this routine takes the new one.
    const cur = row(rn);
    if (cur) setForm((f) => (f?.step === 2 && f.id === rn ? { ...f, version: cur.version } : f));
    const to = r0.data.channel ? rtChName(r0.data.channel, r0.channel_name, chans) : 'History only';
    say('data' in g ? (a === 'run' ? `Queued. It starts when a runner is free, within ${RT_WITHIN_MIN} min, and the result goes to ${to}.` : g.data?.out || 'done') : g.error, 'data' in g);
  }

  const ctl: Ctl = {
    team, list: list ?? [], limit, sum, tpls, chans, now, busy, arm, ask, histErr, form, setForm,
    setAskUrl: (url) => setAsk((x) => (x ? { ...x, url } : x)),
    act: (a, id, extra) => void act(a, id, extra),
  };
  const off = team.access?.record && team.access.status !== 'active';
  return (
    <div data-routines className="flex flex-col gap-s4">
      {off && <p className="m-0 text-sub font-semibold text-warn">Routines run only while the team is active.</p>}
      {err && <p className="m-0 text-sub font-semibold text-warn">{err}</p>}
      <p role="status" id="rt-msg" data-rt-msg tabIndex={-1} className={msg && !msg.ok ? 'm-0 text-sub font-semibold text-warn' : 'empty m-0'}>{msg?.text ?? ''}</p>
      {!list ? (
        err ? <p className="m-0"><button type="button" onClick={() => void load()}>Retry</button></p> : <p className="empty m-0">loading routines…</p>
      ) : form ? (
        <Form c={ctl} />
      ) : sel ? (
        <Detail c={ctl} r={sel} />
      ) : (
        <List c={ctl} gone={!!rid && !sel} />
      )}
    </div>
  );
}
