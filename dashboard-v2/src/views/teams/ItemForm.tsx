// One item's form of a record team, opened in place. Save posts the whole record with only this item replaced.
import { useEffect, useRef, type ReactNode } from 'react';
import type { J } from '../../model/base';
import { Tag } from '../../ui';
import { GOAL_MAX, list0, teamApply, teamCap, teamPatch, teamRetest, textSize } from './lib';
import { Said } from './parts';
import { checkRepos, closeForm, editForm, type Form, personLabel, saveForm, searchPeople, useTs } from './state';

const Field = ({ k, label, hint, children }: { k: string; label: ReactNode; hint?: ReactNode; children: ReactNode }) => (
  <div className="field">
    <label htmlFor={`tf-${k}`}>{label}</label>
    {children}
    {hint && <p className="hint">{hint}</p>}
  </div>
);
const opt = (t: ReactNode) => <span className="opt">{t}</span>;
const val = (e: { target: { value: string } }) => e.target.value;

// A people search: results with Add, for the access users, the PR users or the admins.
function People({ target, have, onAdd }: { target: string; have: string[]; onAdd: (p: J) => void }) {
  const P = useTs((s) => s.people), box = useRef<HTMLInputElement>(null);
  const res = (P?.people ?? []).filter((p) => !have.includes(p.id));
  return (
    <div className="field">
      <label htmlFor={`tf-pq-${target}`}>Find a person</label>
      <input ref={box} id={`tf-pq-${target}`} className="input" data-tfpq={target} autoComplete="off" placeholder="Name, @handle or email"
        value={P?.q ?? ''} onChange={(e) => searchPeople(val(e))} />
      {P?.err ? <p className="unknown">{P.err}</p>
        : P && P.q.trim().length >= 2 && P.at == null ? <p className="hint">The bot has not listed the workspace's people yet. Paste a member ID below: in Slack, open the profile, then More, then Copy member ID.</p>
        : P && P.at && !res.length ? <p className="hint">Nobody matches "{P.q}".</p> : null}
      {res.length > 0 && (
        <ul className="plist">
          {res.map((p) => (
            <li key={p.id}>
              <span><b>{p.name}</b> <span className="hint">@{p.handle}{p.email ? ` · ${p.email}` : ''}</span></span>
              <button type="button" className="linkbtn" data-tfpick={target} onClick={() => { onAdd(p); box.current?.focus(); }}>Add</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Users({ d }: { d: J }) {
  const names = useTs((s) => s.names);
  return d.users.length ? (
    <ul className="plist">
      {d.users.map((u: string) => (
        <li key={u}>
          <span>{personLabel(names, u)}{personLabel(names, u) !== u && <> <span className="mono hint">{u}</span></>}</span>
          <button type="button" className="linkbtn" data-tfunpick="users" aria-label={`Remove ${personLabel(names, u)}`} onClick={() => editForm((x) => ({ ...x, users: x.users.filter((y: string) => y !== u) }))}>Remove</button>
        </li>
      ))}
    </ul>
  ) : null;
}
const addUser = (p: J) => editForm((x) => ({ ...x, users: [...new Set([...x.users, p.id])] }));
const Uid = ({ d }: { d: J }) => (
  <Field k="uid" label={<>Or paste a member ID {opt('· optional')}</>}>
    <input id="tf-uid" className="input mono" value={d.uid ?? ''} placeholder="U0123ABCD" onChange={(e) => editForm((x) => ({ ...x, uid: val(e) }))} />
  </Field>
);

export function ItemForm({ t, rec, f }: { t: J; rec: J; f: Form }) {
  const opts = useTs((s) => s.opts), chans = useTs((s) => (s.chans && s.chans.team === t.profile ? s.chans.channels : null)) ?? [], names = useTs((s) => s.names);
  const box = useRef<HTMLDivElement>(null);
  // The focus goes to the form's first input when it opens.
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('input, textarea, select')?.focus();
  }, [f.item]);
  const d = f.d, set = (k: string) => (e: { target: { value: string } }) => editForm((x) => ({ ...x, [k]: val(e) }));
  const check = (k: string) => (e: { target: { checked: boolean } }) => editForm((x) => ({ ...x, [k]: e.target.checked }));
  const active = rec.status === 'active', retest = active && teamRetest(rec, teamApply(rec, teamPatch(f, rec, t.profile, opts)));
  const O = opts ?? {}, wait = O.loading ? <p className="hint">Loading the choices…</p> : O.err ? <p className="unknown">The choices did not load: {O.err}</p> : null;
  const save = (
    <>
      {retest && <div className="alert warn"><span className="what wrap">This change needs a new test. Nobody can start the team while the test runs, up to 20 minutes. It turns on again when the test passes.</span></div>}
      <div className="row">
        <button type="button" disabled={f.busy} onClick={() => void saveForm()}>{f.busy ? 'Saving…' : retest ? 'Save and test again' : 'Save'}</button>
        <button type="button" className="linkbtn" onClick={closeForm}>Cancel</button>
      </div>
      <Said ok={f.ok} msg={f.msg} />
    </>
  );
  const setIn = (l: string, i: number, k: string) => (e: { target: { value: string } }) => editForm((x) => ({ ...x, [l]: x[l].map((r: J, j: number) => (j === i ? { ...r, [k]: val(e) } : r)) }));
  const pop = (l: string, i: number) => <button type="button" className="linkbtn" onClick={() => editForm((x) => ({ ...x, [l]: x[l].filter((_: J, j: number) => j !== i) }))}>Remove</button>;
  const toggleIn = (l: string, v: string) => (e: { target: { checked: boolean } }) => editForm((x) => {
    const cur: string[] = l === 'mcp' ? list0(x.mcp) : x[l], nx = e.target.checked ? [...new Set([...cur, v])] : cur.filter((y) => y !== v);
    return { ...x, [l]: l === 'mcp' ? nx.join(', ') : nx };
  });
  let body: ReactNode = null;
  switch (f.item) {
    case 'repos':
      body = (
        <>
          {(f.warn ?? []).map((w, i) => <div key={i} className="alert warn"><span className="what wrap">{w.replace(/^WARN: /, '')}</span></div>)}
          <div className="tscroll">
            <table className="ttable"><thead><tr><th scope="col">Repo</th><th scope="col">Role</th><th scope="col">Commits</th><th scope="col"><span className="vh">Remove</span></th></tr></thead>
              <tbody>
                {d.repos.map((r: J, i: number) => (
                  <tr key={i}>
                    <td><input className="input mono" value={r.slug} aria-label={`Repo ${i + 1}`} placeholder="owner/name" onChange={setIn('repos', i, 'slug')} /></td>
                    <td><select className="input" value={r.role} aria-label={`Role of repo ${i + 1}`} onChange={setIn('repos', i, 'role')}>{['work', 'dep', 'data', 'ref'].map((x) => <option key={x}>{x}</option>)}</select></td>
                    <td><select className="input" value={r.commits ?? 'squash'} aria-label={`Commits of repo ${i + 1}`} title="Squash: each round rewrites the PR as one commit. Append: each round adds a commit on the PR." onChange={setIn('repos', i, 'commits')}><option value="squash">Squash</option><option value="append">Append</option></select></td>
                    <td><button type="button" className="linkbtn" aria-label={`Remove repo ${i + 1}`} onClick={() => editForm((x) => ({ ...x, repos: x.repos.filter((_: J, j: number) => j !== i) }))}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            {d.repos.length < 8 && <button type="button" className="linkbtn" onClick={() => editForm((x) => ({ ...x, repos: [...x.repos, { slug: '', role: 'dep' }] }))}>Add repo</button>}
            <button type="button" className="linkbtn" onClick={() => void checkRepos()}>Check again</button>
          </div>
        </>
      );
      break;
    case 'access':
      body = (
        <>
          <fieldset className="group stack sm">
            <legend className="lb">Who can start it</legend>
            <div className="fields2">
              <label className="choice"><input type="radio" name="tf-open" checked={!!d.open} onChange={() => editForm((x) => ({ ...x, open: true }))} /><span className="stack sm"><b>Anyone the bot allows</b><span className="hint">Every person who can use @fxa-agent.</span></span></label>
              <label className="choice"><input type="radio" name="tf-open" checked={!d.open} onChange={() => editForm((x) => ({ ...x, open: false }))} /><span className="stack sm"><b>Only these people</b><span className="hint">Nobody else can start this team.</span></span></label>
            </div>
          </fieldset>
          {!d.open && (
            <div className="fields2">
              <fieldset className="group field">
                <legend className="lb">People {opt(`· ${d.users.length}`)}</legend>
                {d.users.length ? <Users d={d} /> : <p className="hint">Nobody yet.</p>}
                <People target="users" have={d.users} onAdd={addUser} />
                <Uid d={d} />
              </fieldset>
              <fieldset className="group field">
                <legend className="lb">Channels it watches</legend>
                <p className="hint">A tag in one of these channels picks this team. The person must still be on the list.</p>
                {chans.map((c: J) => (
                  <label key={c.id}>
                    <input type="checkbox" checked={d.chans.includes(c.id)} disabled={!!c.why && !d.chans.includes(c.id)}
                      onChange={(e) => editForm((x) => ({ ...x, chans: e.target.checked ? [...new Set([...x.chans, c.id])] : x.chans.filter((y: string) => y !== c.id) }))} />
                    {' '}#{c.name}{c.private && <> <Tag label="private" sq /></>}{c.why && <span className="hint"> · {c.why}</span>}
                  </label>
                ))}
                <Field k="other" label={<>{chans.length ? 'Other channel IDs' : 'Channel IDs'} {opt('· optional')}</>}>
                  <input id="tf-other" className="input" value={d.other} placeholder="C0123ABCD" onChange={set('other')} />
                </Field>
              </fieldset>
            </div>
          )}
          <Field k="prefixes" label={<>Jira keys that pick this team {opt('· at most 5')}</>} hint={rec.jira?.project && !rec.jira.secret ? `Your project key ${rec.jira.project} counts already.` : ''}>
            <input id="tf-prefixes" className="input mono" value={d.prefixes} placeholder="RELAY" onChange={set('prefixes')} />
          </Field>
        </>
      );
      break;
    case 'goal':
      body = (
        <Field k="goal" label={<>What does this team work on? {opt(textSize(d.goal, GOAL_MAX))}</>} hint="The agent reads this at the start of every session.">
          <textarea id="tf-goal" className="input" rows={5} value={d.goal} onChange={set('goal')} />
        </Field>
      );
      break;
    case 'jira':
      body = (
        <>
          <div className="fields2">
            <Field k="project" label="Jira project"><input id="tf-project" className="input mono" value={d.project} placeholder="RELAY" onChange={set('project')} /></Field>
            <Field k="launches_per_day" label={<>Launches a day, empty for the default {opt(`· ${O.caps?.launches_per_day != null ? `at most ${O.caps.launches_per_day}` : 'optional'}`)}</>}>
              <input id="tf-launches_per_day" className="input" type="number" min={0} value={d.launches_per_day} onChange={set('launches_per_day')} />
            </Field>
          </div>
          <div className="fields2">
            <Field k="board" label={<>Board for merged tickets {opt('· optional')}</>}><input id="tf-board" className="input mono" inputMode="numeric" value={d.board} placeholder="225" onChange={set('board')} /></Field>
            <Field k="sprint" label={<>Sprint name starts with {opt('· needs a board')}</>} hint="A merged ticket goes into the board's active sprint with this name. Letters, digits, spaces and ._:/()-, with an optional ^ first.">
              <input id="tf-sprint" className="input mono" value={d.sprint} placeholder="^Team Sprint " onChange={set('sprint')} />
            </Field>
          </div>
          <label><input type="checkbox" checked={d.queue} onChange={check('queue')} /> Take ai-fixme tickets from the queue</label>
          <label><input type="checkbox" checked={d.secret} disabled={!d.queue} onChange={check('secret')} /> Take only secret tickets (a security level, or a security or hackerone label)</label>
          {d.queue && d.secret && <p className="hint">Needs private work repos. Turns off "Anyone the bot allows" and clears the Jira keys. One team per project.</p>}
          <label><input type="checkbox" checked={d.usage} disabled={!d.queue} onChange={check('usage')} /> Show agent time, tokens and cost in the merged comment</label>
          <p className="hint">Turn this off when the team's Jira comments sync to a public place.</p>
        </>
      );
      break;
    case 'tools':
      body = Array.isArray(O.connectors) ? (
        <>
          <label><input type="checkbox" checked={d.dflt} onChange={check('dflt')} /> Use the bot default</label>
          {!d.dflt && (
            <fieldset className="group field">
              <legend className="lb">MCP connectors</legend>
              {O.connectors.map((c: string) => <label key={c}><input type="checkbox" checked={list0(d.mcp).includes(c)} onChange={toggleIn('mcp', c)} /> <span className="mono">{c}</span></label>)}
            </fieldset>
          )}
        </>
      ) : (
        <>
          <Field k="mcp" label={<>MCP connectors {opt('· comma separated, empty for none')}</>} hint="Leave it as the bot default to use the connectors the bot has.">
            <input id="tf-mcp" className="input mono" value={d.mcp} placeholder="the bot default" onChange={set('mcp')} />
          </Field>
          <label><input type="checkbox" checked={d.dflt} onChange={check('dflt')} /> Use the bot default</label>
        </>
      );
      break;
    case 'caps':
      body = (
        <div className="fields2">
          {([['usd_per_day', 'Spend cap a day, USD'], ['usd_per_month', 'Spend cap a month, USD'], ['runners', 'Runners at once']] as const).map(([k, l]) => (
            <Field key={k} k={k} label={<>{l} {opt(`· ${O.caps?.[k] != null ? `at most ${O.caps[k]}, ` : ''}${k === 'runners' ? 'empty for the default' : 'empty for none'}`)}</>}>
              <input id={`tf-${k}`} className="input" type="number" min={k === 'runners' ? 1 : 0} value={d[k]} onChange={set(k)} />
            </Field>
          ))}
        </div>
      );
      break;
    case 'name':
      body = (
        <Field k="label" label="Name shown" hint={`Letters, digits, spaces and ._()-. Empty shows ${teamCap(t.profile)}. The team's id stays ${t.profile}.`}>
          <input id="tf-label" className="input" maxLength={40} value={d.label} placeholder={teamCap(t.profile)} onChange={set('label')} />
        </Field>
      );
      break;
    case 'admins':
      body = (
        <>
          <p className="hint">Team admins get the team's alerts, and in Slack they can use every control in the team's threads, as the owner can. Dashboard rights come from TEAM_ADMINS on the host.</p>
          {d.admins.map((a: J, i: number) => (
            <div key={i} className="fields2">
              <Field k={`a${i}s`} label="Slack member ID" hint={personLabel(names, a.slack) !== a.slack ? personLabel(names, a.slack) : ''}>
                <input id={`tf-a${i}s`} className="input mono" value={a.slack} placeholder="U0123ABCD" onChange={setIn('admins', i, 'slack')} />
              </Field>
              <Field k={`a${i}e`} label="Email"><input id={`tf-a${i}e`} className="input" value={a.email} onChange={setIn('admins', i, 'email')} /></Field>
              {pop('admins', i)}
            </div>
          ))}
          <People target="admins" have={d.admins.map((a: J) => a.slack)} onAdd={(p) => editForm((x) => ({ ...x, admins: [...x.admins, { slack: p.id, email: p.email ?? '' }] }))} />
        </>
      );
      break;
    case 'runner': {
      const slugs: string[] = (rec.repos ?? []).map((r: J) => r.slug);
      body = (
        <>
          <fieldset className="group field">
            <legend className="lb">Stack</legend>
            <label><input type="radio" name="tf-kind" checked={d.kind !== 'fxa'} onChange={() => editForm((x) => ({ ...x, kind: 'none' }))} /> None: the runner gets the repos only</label>
            <label><input type="radio" name="tf-kind" checked={d.kind === 'fxa'} onChange={() => editForm((x) => ({ ...x, kind: 'fxa' }))} /> The FxA stack, started from{' '}
              <select className="input inline" value={d.srepo} aria-label="Repo the FxA stack runs from" onChange={set('srepo')}>{slugs.map((x) => <option key={x}>{x}</option>)}</select>
            </label>
          </fieldset>
          <div className="fields2">
            <Field k="backend" label="Runner">
              <select id="tf-backend" className="input" value={d.backend === 'firecracker' ? 'firecracker' : 'gce'} onChange={set('backend')}><option value="gce">GCE VM</option><option value="firecracker">Firecracker snapshot</option></select>
            </Field>
            <Field k="desktop_url" label={<>Desktop URL {opt('· optional')}</>} hint="The page a screenshot opens, on the runner.">
              <input id="tf-desktop_url" className="input mono" value={d.desktop_url} placeholder="http://localhost:3030/" onChange={set('desktop_url')} />
            </Field>
          </div>
          <label><input type="checkbox" checked={d.android} onChange={check('android')} /> Give the runner an Android emulator</label>
        </>
      );
      break;
    }
    case 'egress': {
      const deny: string[] = O.egress_deny ?? [];
      body = (
        <>
          <Field k="approved" label={<>Approved hosts {opt('· one a line, at most 30')}</>} hint="The runner may reach these hosts and their subdomains, beyond the base list. Paste sites, file drops and tunnels are refused.">
            <textarea id="tf-approved" className="input mono" rows={5} value={d.approved} onChange={set('approved')} />
          </Field>
          {d.requested.length > 0 && (
            <div className="field">
              <span className="lb">Asked for by the team</span>
              <ul className="plist">
                {d.requested.map((h: string) => (
                  <li key={h}>
                    <span className="mono">{h}</span>
                    {String(d.approved).split(/\s+/).includes(h) ? <Tag label="approved" tone="ok" />
                      : <button type="button" className="linkbtn" onClick={() => editForm((x) => ({ ...x, approved: [...list0(x.approved), h].join('\n') }))}>Approve</button>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {deny.length > 0 && <details><summary className="hint">Hosts that are always refused ({deny.length})</summary><p className="hint mono">{deny.join(' ')}</p></details>}
        </>
      );
      break;
    }
    case 'skills':
      body = (
        <>
          {wait}
          {(O.skills ?? []).length ? (
            <fieldset className="group field">
              <legend className="lb">Skills from skills/team-catalog.txt</legend>
              {O.skills.map((k: string) => <label key={k}><input type="checkbox" checked={d.skills.includes(k)} onChange={toggleIn('skills', k)} /> <span className="mono">{k}</span></label>)}
            </fieldset>
          ) : O.skills ? <p className="hint">The catalog is empty.</p> : null}
          <p className="hint">The runner gets these on top of the base skills. A skill is reviewed in this repo before it goes on the catalog.</p>
        </>
      );
      break;
    case 'boot': {
      const cur = (O.boot ?? []).find((b: J) => b.script === d.script);
      body = (
        <>
          {wait}
          <Field k="script" label="Boot script" hint={O.boot && !O.boot.length ? 'This repo has no boot/ scripts yet. A script is reviewed here first.' : "The runner runs it once at boot. It is pinned to the script's SHA-256, so a later edit needs a new pin."}>
            <select id="tf-script" className="input" value={d.script} onChange={set('script')}>
              <option value="">None</option>
              {(O.boot ?? []).map((b: J) => <option key={b.script} value={b.script}>boot/{b.script}.sh</option>)}
            </select>
          </Field>
          {d.script && rec.boot?.script === d.script && cur?.sha256 !== rec.boot?.sha256 && (
            <div className="alert warn"><span className="what wrap">boot/{d.script}.sh changed since it was pinned. Save pins the current version.</span></div>
          )}
        </>
      );
      break;
    }
    case 'secrets': {
      const pre = `fxa-team-${t.profile}--`;
      body = (
        <>
          <p className="hint">Names in Secret Manager, never values. Each name starts {pre}. Set a value in the Secrets row after you save.</p>
          <Field k="jira" label={<>Jira login {opt('· optional')}</>} hint="The Jira account the team's runs use, as email:token. Empty uses the bot's.">
            <span className="row"><span className="mono hint">{pre}</span><input id="tf-jira" className="input mono grow" value={d.jira} placeholder="jira" onChange={set('jira')} /></span>
          </Field>
          <fieldset className="group field">
            <legend className="lb">Files on the runner {opt('· at most 10')}</legend>
            {d.runtime.map((r: J, i: number) => (
              <div key={i} className="fields2">
                <Field k={`r${i}w`} label="Secret"><span className="row"><span className="mono hint">{pre}</span><input id={`tf-r${i}w`} className="input mono grow" value={r.what} onChange={setIn('runtime', i, 'what')} /></span></Field>
                <Field k={`r${i}p`} label="Path on the runner"><input id={`tf-r${i}p`} className="input mono" value={r.path} placeholder="/home/agent/repo/.env" onChange={setIn('runtime', i, 'path')} /></Field>
                {pop('runtime', i)}
              </div>
            ))}
            {d.runtime.length < 10 && <button type="button" className="linkbtn" onClick={() => editForm((x) => ({ ...x, runtime: [...x.runtime, { what: '', path: '' }] }))}>Add a file</button>}
          </fieldset>
        </>
      );
      break;
    }
    case 'pr':
      body = (
        <>
          <label><input type="checkbox" checked={d.open} onChange={check('open')} /> Open draft PRs (off: the team gets diffs only)</label>
          {t.profile === 'fxa' ? <p className="hint">FxA always asks fxa-devs.</p> : (
            <Field k="reviewers" label={<>Reviewers {opt('· comma separated, optional')}</>}><input id="tf-reviewers" className="input mono" value={d.reviewers} onChange={set('reviewers')} /></Field>
          )}
          <Field k="review_rounds" label={<>Automatic review rounds {opt('· 0 to 5')}</>} hint="The rounds the bot runs by itself on a PR for Copilot, CodeRabbit and CI. After that it asks. Empty: 2.">
            <input id="tf-review_rounds" className="input" type="number" min={0} max={5} value={d.review_rounds} onChange={set('review_rounds')} />
          </Field>
          <Field k="labels" label={<>Extra labels {opt('· comma separated, optional')}</>} hint="Every PR also gets auto, the label the pipeline finds its PRs by. coderabbit asks CodeRabbit for a review.">
            <input id="tf-labels" className="input mono" value={d.labels} placeholder="coderabbit" onChange={set('labels')} />
          </Field>
          <fieldset className="group field">
            <legend className="lb">Who can open a PR from Slack {opt(`· ${d.users.length}`)}</legend>
            <p className="hint">Nobody listed: anyone who can steer the session. Team admins always can.</p>
            <Users d={d} />
            <People target="users" have={d.users} onAdd={addUser} />
            <Uid d={d} />
          </fieldset>
          <Field k="infra" label={<>CI failures that are the repo's fault {opt('· comma separated, at most 5')}</>} hint="Each rule is check=log text. A failed check whose log has the text does not count against the PR.">
            <input id="tf-infra" className="input mono" value={d.infra} placeholder="extract=Bad credentials" onChange={set('infra')} />
          </Field>
        </>
      );
      break;
  }
  return <div className="ckbody stack sm" ref={box} data-tform={f.item}>{body}{save}</div>;
}
