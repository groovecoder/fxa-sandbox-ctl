// New team: a name, a work repo, a stack and a goal. It starts as a draft; the server judges every rule.
import { useEffect } from 'react';
import { useApp } from '../../store';
import { Card } from '../../ui';
import { GOAL_MAX, newTeamReadback, teamCap, textSize } from './lib';
import { Said } from './parts';
import { clearBad, createTeam, editNew, useTs } from './state';

const STACKS = [['none', 'No FxA stack', 'The agent works in the repo with its own tools.'], ['fxa', 'Runs the FxA stack', 'The agent boots the FxA services to test its change.']];

export function NewTeam() {
  const admin = useApp((s) => s.viewer.admin), d = useTs((s) => s.newt), bad = useTs((s) => s.bad);
  // A failed create puts the focus on the first field it marks.
  useEffect(() => {
    if (!bad) return;
    document.getElementById(`nt-${bad}`)?.focus();
    clearBad();
  }, [bad]);
  const head = <><a className="hint" href="#teams">← All teams</a><h2 className="th" id="team-h" tabIndex={-1}>New team</h2></>;
  if (!admin) return <div className="tpage">{head}<p className="tsub">Only a team admin can create a team.</p></div>;
  const e = d.errs;
  const aria = (k: string) => (e[k] ? { 'aria-invalid': true, 'aria-describedby': `nt-${k}-err` } : {});
  const err = (k: string) => (e[k] ? <p className="unknown" id={`nt-${k}-err`}>{e[k]}</p> : null);
  return (
    <div className="tpage">
      {head}
      <p className="tsub">A team is a repo that the agent works on. It starts as a draft, and it turns on after a test passes.</p>
      <div className="rtcols">
        <Card>
          <div className="stack">
            <div className="fields2">
              <div className="field">
                <label htmlFor="nt-name">Name</label>
                <input id="nt-name" className="input" value={d.name} autoComplete="off" placeholder="relay" onChange={(x) => editNew({ name: x.target.value })} {...aria('name')} />
                <p className="hint">Lowercase letters, digits and -. It shows as {d.name ? teamCap(d.name) : 'the team'}.</p>
                {err('name')}
              </div>
              <div className="field">
                <label htmlFor="nt-repo">Work repo</label>
                <input id="nt-repo" className="input mono" value={d.repo} placeholder="owner/name" onChange={(x) => editNew({ repo: x.target.value })} {...aria('repo')} />
                <p className="hint">Where the agent opens PRs.</p>
                {err('repo')}
              </div>
            </div>
            <fieldset className="group stack sm" id="nt-stack" tabIndex={-1} {...aria('stack')}>
              <legend className="lb">Stack</legend>
              <div className="fields2">
                {STACKS.map(([v, b, h]) => (
                  <label key={v} className="choice">
                    <input type="radio" name="nt-stack" value={v} checked={d.stack === v} onChange={() => editNew({ stack: v })} />
                    <span className="stack sm"><b>{b}</b><span className="hint">{h}</span></span>
                  </label>
                ))}
              </div>
              {err('stack')}
            </fieldset>
            <div className="field">
              <label htmlFor="nt-goal">What does this team work on? <span className="opt">{textSize(d.goal, GOAL_MAX)}</span></label>
              <textarea id="nt-goal" className="input" rows={5} value={d.goal} onChange={(x) => editNew({ goal: x.target.value })} {...aria('goal')} />
              <p className="hint">The agent reads this at the start of every session.</p>
              {err('goal')}
            </div>
          </div>
        </Card>
        <Card>
          <div className="stack">
            <h3>Before you create it</h3>
            <p className="readback" data-readback>{newTeamReadback(d)}</p>
            <div className="row">
              <button type="button" disabled={d.busy} onClick={() => void createTeam()}>{d.busy ? 'Creating…' : 'Create draft'}</button>
              <a className="btn" href="#teams">Cancel</a>
            </div>
            <Said ok={d.ok} msg={d.msg || 'The fxa-agent GitHub App must be on the repo. If it is not, an org owner installs it. You can create the draft first.'} />
          </div>
        </Card>
      </div>
    </div>
  );
}
