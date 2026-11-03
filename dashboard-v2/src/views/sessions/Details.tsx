// The details panel of the shown session (v1 sessionDetails), and the usage table it shares with Answers.
import { useEffect, type ReactNode } from 'react';
import { modelName, short, stamp, tokn, usd } from '../../format';
import type { Store as State } from '../../store/types';
import { AGENTS, type J, SS } from '../../model/base';
import { chainOf, fixGated, ownerName, sessRoutine, sessStatus, sessTabOf, sessUsd } from '../../model/sessions';
import { readUsage } from '../../store';
import { Kv, Meter } from '../../ui';
import { endsIn, isLive, modelOf, num, pauseIn, pick } from './data';
import { Ring, Timeline, UseBars } from './charts';
import { useNow } from './hooks';

const NR = 'not recorded for this session';
const Sec = ({ title, children }: { title: string; children: ReactNode }) => <div><h2 className="dh">{title}</h2><div className="kvl">{children}</div></div>;

export function Details({ s }: { s: State }) {
  const x = pick(s);
  const now = useNow();
  if (!x) return null;
  const [st] = sessStatus(x);
  if (fixGated(s, x)) return (
    <Sec title="Session">
      <Kv label="State" value={st} /><Kv label="Routine" value="Dependency fix" /><Kv label="Started" value={stamp(x.created)} />
      <p className="na">Only a team admin can see its PR, trigger and cost.</p>
    </Sec>
  );
  const rt = x.runtime || 'claude', model = modelOf(s, x), cost = sessUsd(s, x);
  const ch = chainOf(x, SS(s)), convUsd = ch.reduce((n, y) => n + (sessUsd(s, y) || 0), 0), convTurns = ch.reduce((n, y) => n + (Number(y.turns) || 0), 0);
  const ag: J = AGENTS(s) ?? {}, idle = num(ag.session_idle_seconds), maxRun = num(ag.session_max_run_seconds);
  const p = pauseIn(s, x, now), e = endsIn(s, x, now), live = isLive(x), rs = num(x.runner_s);
  let peak: J = null;
  try { peak = JSON.parse(String(x.res_peak || 'null')); } catch { /* not JSON */ }
  const pk = peak && typeof peak === 'object' && 'load1' in peak ? peak : null;
  const prev = x.resume_from ? SS(s).find((y) => y.key === x.resume_from) : null;

  return (
    <>
      <Sec title="Session">
        <Kv label="State" value={st} />
        <Kv label="Agent" value={<>{rt === 'codex' ? 'Codex' : 'Claude'}{model && <> · <span className="font-mono">{model}</span></>}</>} />
        <Kv label={ch.length > 1 ? `Cost, ${ch.length} sessions` : 'Cost'} value={<>{convUsd ? usd(convUsd) : '—'}{ch.length > 1 && <span className="na"> · this session {cost ? usd(cost) : '—'}</span>}</>} />
        <Kv label="Turns" value={<>{convTurns}{ch.length > 1 && <span className="na"> · this session {Number(x.turns) || 0}</span>}</>} />
        {x.routine_run ? <Kv label="Routine" value={<a className="text-link" href={`#teams/${x.profile || 'fxa'}/routines`}>{sessRoutine(s, x)}</a>} />
          : <Kv label="Owner" value={ownerName(s, x) || 'unknown'} />}
        <Kv label="Started" value={stamp(x.created)} />
        {!!x.resume_from && <Kv label="Resumed from" value={<a className="text-link" href={`#sessions/${prev ? sessTabOf(prev) : 'stopped'}/${x.resume_from}`}>{String(x.resume_from)}</a>} />}
        {p != null && <Kv label="Idle pause in" value={<Ring left={p} total={idle ?? p} label="Idle pause in" />} />}
        {e != null && <Kv label="Sandbox ends in" value={<Ring left={e} total={maxRun ?? e} label="Sandbox ends in" />} />}
        {ch.length > 1 && (
          <ol className="chain" aria-label="Conversation">
            {[...ch].reverse().map((y) => (
              <li key={y.key} aria-current={y.key === x.key ? 'true' : undefined}>
                <a className="key" href={`#sessions/${sessTabOf(y)}/${y.key}`}>{y.key}</a>
                <span className="m">{usd(sessUsd(s, y) ?? null)} · {Number(y.turns) || 0} turn{Number(y.turns) === 1 ? '' : 's'}</span>
              </li>
            ))}
          </ol>
        )}
      </Sec>
      <Timeline chain={ch} now={now} maxRun={maxRun} pauseAt={p != null ? now + p : null} sel={x.key} />
      <div><h2 className="dh">Usage by model</h2><Usage k={x.key} s={s} bars /></div>
      <Sec title="Runner">
        {!!x.boot_s && <Kv label="Boot" value={`${Math.round(Number(x.boot_s))} s${x.boot_backend ? ` · ${x.boot_backend}` : ''}`} />}
        {rs != null ? <Kv label="Busy, idle" value={`${short(num(x.busy_s))} busy · ${short(num(x.idle_s))} idle of ${short(rs)}`} />
          : <Kv label="Busy, idle" value={live ? 'recorded when it stops' : NR} na />}
        {x.verify_runs != null ? <Kv label="Verify runs" value={`${x.verify_runs} · ${x.verify_full ?? 0} full · ${short(num(x.verify_s))}${num(x.verify_fail_runs) ? ` · ${x.verify_fail_runs} with a FAIL` : ''}`} />
          : <Kv label="Verify runs" value={NR} na />}
        {x.stack_starts != null ? <Kv label="Stack starts" value={`${x.stack_starts}${num(x.stack_starts) ? ` · ${short(num(x.stack_s))}` : ''}${num(x.stack_fails) ? ` · ${x.stack_fails} failed` : ''}`} />
          : <Kv label="Stack starts" value={NR} na />}
        {pk && <Kv label="Peak load, memory, disk" value={`${pk.load1} · ${(Number(pk.mem_mb) / 1024).toFixed(1)} GB · ${pk.disk_pct}%`} />}
        {pk && num(pk.disk_pct) != null && <Meter pct={num(pk.disk_pct)} tone={num(pk.disk_pct)! >= 90 ? 'bad' : num(pk.disk_pct)! >= 75 ? 'warn' : 'info'} label={`Peak disk ${pk.disk_pct}%`} />}
        {!!x.compute_usd && <Kv label="Compute, estimated" value={usd(num(x.compute_usd))} />}
        {!!x.stop_reason && x.stop_reason !== x.state && <Kv label="Stopped because" value={String(x.stop_reason)} />}
      </Sec>
    </>
  );
}

// LLM use by model for one run, from /api/usage: read when shown, and again every 30 s while shown.
export function Usage({ k, s, bars }: { k: string; s: State; bars?: boolean }) {
  useEffect(() => {
    void readUsage(k);
    const t = setInterval(() => void readUsage(k), 30000);
    return () => clearInterval(t);
  }, [k]);
  const u = s.usage[k];
  if (!u) return <div className="empty">Loading…</div>;
  if (u.error && !u.models.length) return <div className="empty">Could not read the LLM calls for this run.</div>;
  const rows = u.models as J[];
  if (!rows.length) return <div className="empty">No LLM calls recorded for this run.</div>;
  const t = (f: string) => rows.reduce((n, r) => n + (Number(r[f]) || 0), 0);
  const tr = (r: J, i: number | 'tot') => (
    <tr key={i} className={i === 'tot' ? 'tot' : undefined}>
      <td>{i === 'tot' ? <b>Total</b> : modelName(r.model)}</td><td>{r.calls}</td><td>{tokn(r.cache_read)}</td><td>{tokn(r.cache_write)}</td>
      <td>{tokn(r.input)}</td><td>{tokn(r.output)}</td><td><b>{usd(r.usd)}</b></td>
    </tr>
  );
  return (
    <>
      {/* A keyboard user can scroll the table when it is wider than the panel. */}
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="LLM calls by model">
      <table className="table figures dense">
        <thead><tr><th>Model</th><th>Calls</th><th title="cache reads">Cache read</th><th title="cache writes">Cache write</th><th>Input</th><th>Output</th><th>Cost</th></tr></thead>
        <tbody>
          {rows.map(tr)}
          {rows.length > 1 && tr({ calls: t('calls'), cache_read: t('cache_read'), cache_write: t('cache_write'), input: t('input'), output: t('output'), usd: t('usd') }, 'tot')}
        </tbody>
      </table>
      </div>
      {bars && <div className="mt-s3"><UseBars rows={rows} /></div>}
    </>
  );
}
