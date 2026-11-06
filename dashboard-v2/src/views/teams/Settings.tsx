// A team's Settings: read-only for a folder team or a viewer who is not an admin; the record editor for an admin.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Terminal } from '../../charts';
import { stamp, usd } from '../../format';
import type { J } from '../../model/base';
import { APP_FAIL, rtSum, teamName } from '../../model/teams';
import { useApp } from '../../store';
import { Card, Kv, Tag } from '../../ui';
import { ItemForm } from './ItemForm';
import { FXA_RO, minsSince, plural, repoShip, teamCap, teamTestState, teamTools, teamWho } from './lib';
import { Said } from './parts';
import {
  activateOnPass, arm, deleteTeam, editPpl, jsonAct, loadAudit, loadChans, loadPpl, loadRecord, openForm, openJson, readTest, savePpl, setSecret, setStatus, startTest,
  stopTest, toggleMore, useTs,
} from './state';

const FIREFOX_READ = 'Firefox: read; a change comes back as a diff, never a push';

function RunsOn({ t }: { t: J }) {
  if (t.android) return <Kv label="Every runner" value={`the fxa-dev-android image on GCE (nested KVM): FxA, Firefox with an artifact build, Fenix, an emulator and Nightly. ${FIREFOX_READ}`} />;
  return (
    <>
      <Kv label="Slack sessions" value={`the Firecracker snapshot, with the FxA stack running and Firefox at ~/firefox (an artifact build). On GCE (the fxa-dev image) when the snapshot host cannot start. ${FIREFOX_READ}`} />
      <Kv label="Pipeline runs, with a Jira queue" value="the fxa-dev image on GCE: FxA, no Firefox (the agent makes a sparse clone). A ticket that asks for Android gets the fxa-dev-android image." />
    </>
  );
}

// What a folder or env team gets, or a record team for a viewer who is not an admin.
function Info({ t }: { t: J }) {
  const rec = !!t.access?.record, repos: J[] = t.repos ?? [];
  const where = t.access?.open === 'built-in' ? 'The operator changes the FxA team in profiles/fxa/ in the repo.' : rec ? 'A team admin changes this team. Ask the operator.'
    : `The operator changes this team in profiles/${t.profile}/ in the repo, and its access in the bot .env.`;
  return (
    <>
      <Card>
        <h2>Settings</h2>
        <Kv label="Who can start it" value={teamWho(t)} />
        {repos.length ? repos.map((r) => <Kv key={r.slug} label={r.slug} value={`${r.role}${r.role === 'work' ? ` · ${repoShip(r)[2]}` : ''}`} />) : <Kv label="Repos" value="none" na />}
        <Kv label="Tools" value={teamTools(t.mcp)} />
        <Kv label="Mode" value={t.read_only ? 'diffs only' : 'draft PRs'} />
        <p className="hint">{where}</p>
      </Card>
      <Card><h2>Runs on</h2><RunsOn t={t} /></Card>
    </>
  );
}

// The test card: the state, the live log from the team-test frames, and the buttons for each state.
function TestCard({ t, rec }: { t: J; rec: J }) {
  const p = t.profile, test = useTs((s) => (s.test?.team === p ? s.test : null)), tact = useTs((s) => s.tact);
  const feed = useApp((s) => s.feeds[`team-test:${p}`] ?? null), live = useApp((s) => s.conn.mode === 'live');
  const [act, setAct] = useState(true), [, tick] = useState(0), btn = useRef<HTMLButtonElement>(null);
  // The frames are the newer data while the stream is open; the read is the start and the fallback.
  const x = (feed?.data as J) ?? test?.data ?? t.test, st = teamTestState(t, (feed?.data as J) ?? test?.data), active = rec.status === 'active';
  useEffect(() => {
    void readTest(p);
  }, [p]);
  useEffect(() => {
    if (st !== 'running') return;
    // Elapsed time each 10 s; while polling, the state is read again at the same time.
    const id = setInterval(() => { tick((n) => n + 1); if (!live) void readTest(p); }, 10000);
    return () => clearInterval(id);
  }, [st, live, p]);
  useEffect(() => {
    if (st === 'passed') void activateOnPass(p);
  }, [st, p]);
  // The banner's Test and activate: the focus goes to Test once the record is in the card.
  useEffect(() => {
    if (tact !== p || !btn.current) return;
    btn.current.focus();
    useTs.setState({ tact: '' });
  }, [tact, p]);
  const since = x?.started_at ? new Date(x.started_at * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
  const mins = x?.started_at ? minsSince(x.started_at) : null;
  const lines: string[] = x?.lines ?? [];
  const go = (label: string, withAct: boolean) => (
    <div className="row">
      <button ref={btn} type="button" data-ttest disabled={test?.busy} onClick={() => void startTest(p, withAct ? act : !active)}>{label}</button>
      {withAct && <label className="hint"><input type="checkbox" checked={act} onChange={(e) => setAct(e.target.checked)} /> Activate when it passes</label>}
    </div>
  );
  const who = teamWho(t, rec);
  const [says, tag, body]: [ReactNode, ReactNode, ReactNode] = st === 'running' ? [
    `Running${since ? ` since ${since}` : ''}${mins != null ? `, for ${plural(mins, 'minute')}` : ''}. The first answer can take up to 20 minutes. You can leave this page.`,
    <Tag label="Running" tone="info" run live />,
    <>
      <div className="tlog"><Terminal title="The test log" lines={lines} state="running" /></div>
      <div className="row"><button type="button" disabled={test?.busy} onClick={() => void stopTest(p)}>Stop the test</button><span className="hint">It stops the runner the test booted. The team stays as it is.</span></div>
      <p className="hint">{!test?.activate ? 'It stays a draft when it passes.' : `${teamName(t)} turns on when it passes.`}</p>
    </>,
  ] : st === 'passed' && active ? ['Passed. The team is active.', null, go('Test again', false)]
    : st === 'passed' ? [who === 'Nobody' ? 'Passed. Activate it. Nobody can start it from Slack until you add people.' : `Passed. Activate it to let ${who.toLowerCase()} start it.`,
      <Tag label="Passed" tone="ok" />, <div className="row"><button ref={btn} type="button" onClick={() => void setStatus(p, 'active')}>Activate</button></div>]
    : st === 'failed' ? ['Failed. Read the log, change the setup, then test again.', <Tag label="Failed" tone="bad" />,
      <>{lines.length > 0 && <pre className="log" aria-label="The last lines of the test log">{lines.join('\n')}</pre>}{go('Test and activate', true)}</>]
    : ['Boots one runner with this setup. The first answer can take up to 20 minutes.', null, go(active ? 'Test' : 'Test and activate', !active)];
  return (
    <Card>
      <div className="stack">
        <div className="ck">
          <span className={`num ${st === 'passed' ? 'ok' : st === 'failed' ? 'warn' : 'info'}`} aria-hidden="true">{st === 'passed' ? '✓' : '2'}</span>
          <div className="who"><span className="nm">Test and activate</span><span className="says">{says}</span></div>
          {tag}
        </div>
        {body}
        <Said ok={test?.ok} msg={test?.msg} />
      </div>
    </Card>
  );
}

// The ways a session of a record team can start, each with its rule and its form.
function Inputs({ t, rec, f, admin }: { t: J; rec: J; f: J; admin: boolean }) {
  const p = t.profile, chans = useTs((s) => (s.chans && s.chans.team === p ? s.chans.channels : null)), secrets = useTs((s) => (s.rec && s.rec.name === p ? s.rec.secrets : null));
  const sum = useApp((s) => (admin ? s.teamsUi.summary.data : null)), list = useApp((s) => s.teamsUi.routines[p] as J);
  const a = rec.access ?? {}, j = rec.jira ?? {}, c = rec.caps ?? {}, draft = rec.status !== 'active';
  const ch: string[] = a.channels ?? [];
  useEffect(() => {
    if (ch.length) loadChans(p);
  }, [ch.length, p]);
  const row = (k: string, name: string, tg: ReactNode, lines: string[], b: ReactNode) => (
    <div key={k}>
      <div className="ck tin" data-tin={k}>
        <div className="who"><span className="nm">{name} {tg}</span>{lines.filter(Boolean).map((l, i) => <span key={i} className="says">{l}</span>)}</div>
        {admin && b}
      </div>
      {f?.item === k && <ItemForm t={t} rec={rec} f={f} />}
    </div>
  );
  const btn = (k: string, l: string) => <button type="button" className="linkbtn" data-tf={k} disabled={!!f} onClick={() => openForm(p, k)}>{l}</button>;
  const go = <a className="lnk" href={`#teams/${p}/routines`}>Open Routines</a>;
  const n = (a.users ?? []).length, after = draft ? ' (after the test)' : '';
  const names = ch.map((id) => { const x = (chans ?? []).find((y: J) => y.id === id); return x ? `#${x.name}` : id; }).join(', ');
  const slack: [string, ReactNode] = a.open ? ['Anyone the bot allows can tag @fxa-agent', <Tag label="on" tone="ok" />]
    : n ? [`${n} ${n === 1 ? 'person' : 'people'} can start it${ch.length ? ` · watches ${names}` : ''}`, <Tag label="on" tone="ok" />]
    : ch.length ? [`Nobody can start it from Slack · watches ${plural(ch.length, 'channel')}`, <Tag label="add people" tone="warn" />]
    : ['Nobody can start it from Slack', <Tag label="off" />];
  // The bot routes a key by the team's prefixes and its project, unless the team takes secret tickets.
  const keys = [...new Set([...(a.jira_prefixes ?? []), ...(j.project && !j.secret ? [j.project] : [])])];
  const cap = c.launches_per_day != null ? ` · at most ${c.launches_per_day} launches a day` : ' · at most 20 launches a day (default)';
  const login = secrets?.[rec.secrets?.jira] === 'present' ? 'present' : 'missing';
  const jira: [string, ReactNode] = !j.project ? ['Not used', <Tag label="off" />] : !j.queue ? [`Off · project ${j.project}`, <Tag label="off" />]
    : [`${j.secret ? `Takes only ${j.project} secret tickets (a security level, or a security or hackerone label)` : `Takes ${j.project} tickets with the ai-fixme label, every 5 minutes on weekdays, hourly on weekends, 07:04 to 19:59 New York time`}${cap}`, <Tag label="on" tone="ok" />];
  // Routines and dependency PR fixes come from the routine summary (admins only); a dependency fix runs on pr-label.
  const rs: J[] | null = sum ? Object.values(sum.routines ?? {}).filter((x: J) => x.team === p) : null;
  const sched = (rs ?? []).filter((x) => x.on !== 'pr-label'), dep = (rs ?? []).filter((x) => x.on === 'pr-label');
  const on = sched.filter((x) => !x.paused).length, held = sched.length - on, nx = Math.min(...sched.map((x) => x.next ?? Infinity)), depOn = dep.filter((x) => !x.paused).length;
  const depL = Array.isArray(list) ? list.filter((r: J) => r.data?.on === 'pr-label' && !r.paused).map((r: J) => `On for ${r.data.pr?.repo ?? (r.data.repos ?? [])[0] ?? 'its repo'}, label ${r.data.pr?.label ?? 'agent-help'}`) : [];
  return (
    <div className="stack sm">
      {row('access', 'Slack', slack[1], [slack[0] + (a.open || n ? after : ''), keys.length ? `A message with ${keys.map((k) => `${k}-123`).join(' or ')} picks this team` : ''], btn('access', 'Change'))}
      {row('jira', 'Jira queue', jira[1], [jira[0], j.project ? `Jira login: ${rec.secrets?.jira ? login : "the bot's"}` : '', j.queue && j.usage === false ? 'The merged comment shows no time, tokens or cost' : '',
        j.board ? `A merged ticket goes into the active sprint of board ${j.board}${j.sprint ? ` whose name matches ${j.sprint.trim()}` : ''}` : ''], btn('jira', j.project ? 'Change' : 'Set up'))}
      {rs && row('routines', 'Routines', on ? <Tag label="on" tone="ok" /> : <Tag label="off" />,
        [sched.length ? `${[on || !held ? `${on} on a schedule` : '', held ? `${held} paused` : ''].filter(Boolean).join(', ')}${nx < Infinity ? ` · next run ${stamp(nx)}` : ''}` : 'None'], go)}
      {rs && row('depfix', 'Dependency PRs', depOn ? <Tag label="on" tone="ok" /> : <Tag label="off" />, [depOn ? (depL.length ? depL.join('; ') : `${depOn} on`) : 'Off'], go)}
    </div>
  );
}

function More({ k, title, sub, children }: { k: string; title: string; sub: string; children: ReactNode }) {
  const open = useTs((s) => s.more.includes(k));
  return (
    <details className="card tmore-card" open={open} onToggle={(e) => { const o = (e.target as HTMLDetailsElement).open; if (o !== open) toggleMore(k, o); }}>
      <summary><b>{title}</b> <span className="hint">· {sub}</span></summary>
      <div className="stack sm tmore">{children}</div>
    </details>
  );
}

// History: the audit as a timeline, newest first, with the generation and the test pass.
function History({ p, tested }: { p: string; tested: unknown }) {
  const open = useTs((s) => s.more.includes('history')), audit = useTs((s) => (s.audit?.team === p ? s.audit : null));
  const changed = useApp((s) => (s as { live?: { changed: Record<string, number> } }).live?.changed[`team_audit:${p}`] ?? 0);
  useEffect(() => {
    if (open) void loadAudit(p);
  }, [open, p, changed]);
  if (!audit) return <p className="empty">loading…</p>;
  if (audit.err) return <p className="unknown">{audit.err}</p>;
  if (!audit.rows.length) return <p className="na">No changes yet.</p>;
  return (
    <ol className="ttimeline" aria-label="Changes, newest first">
      {audit.rows.map((r, i) => (
        <li key={i}>
          <span className="when">{stamp(r.at)}</span>
          <span><b>{r.action}</b> by {String(r.actor ?? '').split('@')[0]}{r.changed ? `: ${r.changed}` : ''}</span>
          {r.new_gen != null && <span className="mono hint">generation {r.new_gen}</span>}
          {tested != null && String(r.new_gen) === String(tested) && <Tag label="test passed here" tone="ok" />}
        </li>
      ))}
    </ol>
  );
}

function Danger({ t, active }: { t: J; active: boolean }) {
  const p = t.profile, a = useTs((s) => s.arm), r = useApp((s) => rtSum(s, p));
  const off = a === `${p}:disabled`, del = a === `${p}:delete`, blur = (k: string) => () => { if (useTs.getState().arm === `${p}:${k}`) arm(''); };
  return (
    <Card flat>
      <div className="stack sm">
        <h3>{active ? 'Turn off or delete' : 'Delete this team'}</h3>
        <p className="hint">{active ? 'Turn off stops new Slack sessions, the Jira queue, routines and dependency PR fixes. To turn it on again you need a new test. ' : ''}Delete is refused while a session of the team can resume, and it also deletes the team's routines{r ? ` (${r.routines})` : ''}. You cannot undo it.</p>
        <div className="row">
          {active && <button type="button" onClick={() => void setStatus(p, 'disabled')} onBlur={blur('disabled')}>{off ? 'Turn off: click again' : 'Turn off'}</button>}
          <button type="button" onClick={() => void deleteTeam(p)} onBlur={blur('delete')}>{del ? `Delete ${teamName(t)}: click again` : `Delete ${teamName(t)}`}</button>
        </div>
      </div>
    </Card>
  );
}

function Json({ p }: { p: string }) {
  const e = useTs((s) => (s.json?.name === p ? s.json : null));
  if (!e) return <div className="row"><button type="button" onClick={() => openJson(p)}>Load the record</button></div>;
  return (
    <div className="stack sm">
      <p className="hint">Every field at once. Each field also has its own form above. Save checks the generation you loaded.</p>
      <textarea className="team-json mono input" rows={22} spellCheck={false} aria-label="Team record JSON" value={e.text}
        onChange={(x) => useTs.setState({ json: { ...e, text: x.target.value } })} />
      <div className="row"><button type="button" onClick={() => void jsonAct('validate')}>Validate</button><button type="button" onClick={() => void jsonAct('save')}>Save</button></div>
      {e.msg && <p className={e.ok ? 'empty prewrap' : 'unknown prewrap'}>{e.msg}</p>}
    </div>
  );
}

function SecretRow({ p, s, st }: { p: string; s: string; st: string }) {
  const [v, setV] = useState('');
  return (
    <div className="row">
      <span className="mono">{s}</span><Tag label={st} tone={st === 'present' ? undefined : 'warn'} />
      <input type="password" className="input short" autoComplete="off" placeholder="new value" aria-label={`New value for ${s}`} value={v} onChange={(e) => setV(e.target.value)} />
      <button type="button" onClick={() => void setSecret(p, s, v).then((ok) => ok && setV(''))}>Set</button>
    </div>
  );
}

// The record editor of a team admin: each item has its own form, and the server stays the judge.
function Setup({ t }: { t: J }) {
  const p = t.profile, R = useTs((s) => (s.rec?.name === p ? s.rec : null)), loading = useTs((s) => s.loading === p);
  const f = useTs((s) => (s.form?.team === p ? s.form : null)), msg = useTs((s) => (s.msg?.team === p ? s.msg : null));
  useEffect(() => {
    if (!R && !loading) void loadRecord(p);
  }, [R, loading, p]);
  if (!R) return <Card><p className="empty">loading the record…</p></Card>;
  if (!R.ok || !R.rec) return <Card><p className="unknown">The record did not load: {R.msg || 'no answer'}</p><div className="row"><button type="button" onClick={() => void loadRecord(p)}>Load the record</button></div></Card>;
  const rec = R.rec, active = rec.status === 'active', fx = p === 'fxa', ro = (k: string) => fx && FXA_RO.includes(k);
  const cli = <span className="hint">The operator changes this with the CLI</span>;
  const btn = (k: string, l: string, link = false) => (ro(k) ? cli : <button type="button" className={link ? 'linkbtn' : undefined} data-tf={k} disabled={!!f} onClick={() => openForm(p, k)}>{l}</button>);
  const rowv = (k: string, l: string, v: ReactNode, b: string) => (
    <>
      <div className="kv"><span>{l}</span><span>{v} · {btn(k, b, true)}</span></div>
      {f?.item === k && <ItemForm t={t} rec={rec} f={f} />}
    </>
  );
  // The repos of the record, with the GitHub App state from the feed (a new draft has none yet).
  const fr = new Map<string, J>((t.repos ?? []).map((r: J) => [String(r.slug).toLowerCase(), r])), rs: J[] = rec.repos ?? [];
  const miss = rs.filter((r) => { const x = fr.get(String(r.slug).toLowerCase()); return r.role === 'work' && x && !x.write && x.why !== APP_FAIL; });
  const c = rec.caps ?? {}, sec = Object.entries(R.secrets ?? {}), goal = String(rec.prompts?.goal_md ?? '').trim();
  const egA: string[] = rec.egress?.approved ?? [], egAsk = (rec.egress?.requested ?? []).filter((h: string) => !egA.includes(h)).length;
  const prs = rec.pr ?? {}, rounds = prs.review_rounds ?? 2;
  return (
    <div className="stack lg">
      <Said ok={msg?.ok} msg={msg?.msg} />
      <Card>
        <div className="stack">
          <div className="ck">
            <span className={`num ${miss.length ? 'warn' : 'ok'}`} aria-hidden="true">{miss.length ? '!' : '✓'}</span>
            <div className="who">
              <span className="nm">Repo{rs.length === 1 ? '' : 's'}</span>
              <span className="says">
                {rs.length === 1 ? <span className="mono">{rs[0].slug}</span> : `${rs.length} repos`}
                {miss.length ? <> · the GitHub App is missing on <span className="mono">{miss.map((r) => r.slug).join(', ')}</span></> : fr.size ? ' · the GitHub App is installed' : ''}
                {` · ${rec.stack?.kind === 'fxa' ? 'the FxA stack' : 'no FxA stack'}`}
              </span>
            </div>
            {f?.item !== 'repos' && btn('repos', 'Edit')}
          </div>
          {miss.length > 0 && f?.item !== 'repos' && <div className="alert warn"><span className="what wrap">An org owner installs the fxa-agent GitHub App on {miss.map((r) => r.slug).join(', ')}. Until then, its work ships as a diff.</span></div>}
          {f?.item === 'repos' && <ItemForm t={t} rec={rec} f={f} />}
        </div>
      </Card>
      <TestCard t={t} rec={rec} />
      <Card flat>{rowv('goal', 'What it works on', fx ? "FxA's built-in goal" : goal ? `${goal.slice(0, 80)}${goal.length > 80 ? '…' : ''}` : 'not set', 'Edit')}</Card>
      <Card>
        <div className="stack sm">
          <h3>How work reaches this team</h3>
          <p className="hint">The ways a session can start. Each one has its own rule.</p>
          <Inputs t={t} rec={rec} f={f} admin />
          <p className="hint">{active ? '' : 'Every input stops while the team is not active. '}Every input counts against the spend cap below.</p>
        </div>
      </Card>
      <Card flat>
        <div className="stack sm">
          <h3>Budget</h3>
          {rowv('caps', 'Spend cap', [c.usd_per_day != null ? `${usd(c.usd_per_day)} a day` : '', c.usd_per_month != null ? `${usd(c.usd_per_month)} a month` : ''].filter(Boolean).join(', ') || 'No spend cap', 'Change')}
          {c.runners != null && <p className="hint">At most {c.runners} runners at once.</p>}
        </div>
      </Card>
      <More k="about" title="About the team" sub="name, admins and PR rules">
        {rowv('name', 'Name shown', rec.label || teamCap(p), 'Change')}
        {rowv('admins', 'Team admins', (rec.admins ?? []).length ? rec.admins.map((a: J) => a.email || a.slack).join(', ') : 'None', (rec.admins ?? []).length ? 'Change' : 'Add')}
        {rowv('pr', 'PR rules', prs.open === false ? 'Diffs only'
          : `Draft PRs${fx ? ', reviewers fxa-devs (built in)' : (prs.reviewers ?? []).length ? `, reviewers ${prs.reviewers.join(', ')}` : ''}${(prs.infra_checks ?? []).length ? `, ${plural(prs.infra_checks.length, 'CI infra rule')}` : ''}${(prs.users ?? []).length ? `, opened from Slack by ${prs.users.length} ${prs.users.length === 1 ? 'person' : 'people'} and the admins` : ''}, labels ${['auto', ...(prs.labels ?? [])].join(', ')}, ${plural(rounds, 'automatic review round')}, ${plural(prs.admin_review_rounds ?? 10, 'round')} for team admins, waits ${prs.review_quiet_minutes ?? 15} min for a reviewer`, 'Change')}
      </More>
      <More k="runs" title="How it runs" sub="a change needs a new test">
        {rowv('tools', 'Tools', teamTools(rec.mcp), 'Change')}
        {rowv('skills', 'Skills', (rec.skills ?? []).length ? rec.skills.join(', ') : 'The base skills only', 'Change')}
        {rowv('runner', 'Runner', `${rec.stack?.kind === 'fxa' ? `FxA stack from ${rec.stack.repo ?? 'mozilla/fxa'}` : 'No stack'}, ${rec.runner?.backend === 'firecracker' ? 'Firecracker' : 'GCE VM'}${rec.runner?.android ? ', Android' : ''}`, 'Change')}
        {rowv('egress', 'Network', `${plural(egA.length, 'approved host')}${egAsk ? `, ${egAsk} asked for` : ''}`, 'Change')}
        {rowv('boot', 'Boot script', rec.boot?.script ? `boot/${rec.boot.script}.sh` : 'None', 'Change')}
        {rowv('secrets', 'Secrets', sec.length ? `${sec.length} named` : 'None', 'Change names')}
        {sec.length > 0 && <>{sec.map(([s, st]) => <SecretRow key={s} p={p} s={s} st={st} />)}<p className="hint">A value is stored in Secret Manager and never shown again.</p></>}
      </More>
      <More k="json" title="Edit the record as JSON" sub="every field at once, for an expert"><Json p={p} /></More>
      <More k="history" title="History" sub="every change, newest first"><History p={p} tested={R.tested} /></More>
      {!fx && <Danger t={t} active={active} />}
    </div>
  );
}

// The team's people: an email, the Slack user the server finds from it, and a GitHub username. That team's admins only.
export function People({ p }: { p: string }) {
  const P = useTs((s) => (s.ppl?.team === p ? s.ppl : null));
  useEffect(() => {
    void loadPpl(p);
  }, [p]);
  if (!P) return <Card><h2>People</h2><p className="empty">loading…</p></Card>;
  const cell = (i: number, k: string, label: string, ph: string) => (
    <input className={`input${k === 'email' ? ' mono' : ''}`} value={P.rows[i]?.[k] ?? ''} aria-label={`${label} of person ${i + 1}`} placeholder={ph}
      onChange={(e) => editPpl((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: e.target.value, ...(k === 'email' ? { slack: undefined } : {}) } : r)))} />
  );
  return (
    <Card>
      <div className="stack sm" data-people>
        <h2>People</h2>
        <p className="hint">Type an email and a GitHub username. Save finds the Slack user from the email. The pipeline maps a team admin's GitHub comments with this list.</p>
        {P.rows.length > 0 && (
          <div className="tscroll">
            <table className="ttable"><thead><tr><th scope="col">Email</th><th scope="col">Slack user</th><th scope="col">GitHub username</th><th scope="col"><span className="vh">Remove</span></th></tr></thead>
              <tbody>
                {P.rows.map((r, i) => (
                  <tr key={i}>
                    <td>{cell(i, 'email', 'Email', 'name@example.com')}</td>
                    <td>{r.slack ? <span className="mono">{r.slack}</span> : <span className="na">{r.email ? 'none' : 'after save'}</span>}</td>
                    <td>{cell(i, 'github', 'GitHub username', 'login')}</td>
                    <td><button type="button" className="linkbtn" aria-label={`Remove person ${i + 1}`} onClick={() => editPpl((rs) => rs.filter((_, j) => j !== i))}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!P.rows.length && P.ok && <p className="na">Nobody yet.</p>}
        <div className="row">
          <button type="button" className="linkbtn" onClick={() => editPpl((rs) => [...rs, { email: '', github: '' }])}>Add a person</button>
          <button type="button" disabled={P.busy} onClick={() => void savePpl()}>Save</button>
        </div>
        <Said ok={P.ok} msg={P.msg} />
        {P.notes.length > 0 && <ul className="hint">{P.notes.map((n) => <li key={n.email}><span className="mono">{n.email}</span>: {n.why}</li>)}</ul>}
      </div>
    </Card>
  );
}

export function Settings({ t }: { t: J }) {
  const admin = useApp((s) => s.viewer.admin), mine = useApp((s) => s.viewer.teams.includes(t.profile));
  const main = t.access?.record && admin ? <Setup t={t} /> : <Info t={t} />;
  return t.access?.record && (admin || mine) ? <>{main}<People p={t.profile} /></> : main;
}
