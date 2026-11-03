// The small Teams parts that more than one page shows: the budget, test and problem cells, and the test tag.
import { usd } from '../../format';
import type { J } from '../../model/base';
import { Meter, Tag } from '../../ui';
import { budgetOf, teamProblem, teamTestState } from './lib';

export function BudgetCell({ t }: { t: J }) {
  const b = budgetOf(t);
  if (b.kind === 'error') return <span className="unknown">budget unknown: the spend file cannot be read</span>;
  if (b.kind === 'none') return <span className="na">budget unknown on this host</span>;
  if (b.kind === 'nocap') return <><span className="num">{usd(b.spent)}</span> <span className="na">no cap</span></>;
  return (
    <>
      <span className="num">{usd(b.spent)} <span className="na">of {usd(b.cap)}</span></span>
      <Meter pct={b.pct} tone={b.tone} label={`${Math.round(b.pct)}% of the budget`} />
    </>
  );
}

export function TestTag({ t, data }: { t: J; data?: J }) {
  const st = teamTestState(t, data);
  return st === 'passed' ? <Tag label="passed" tone="ok" /> : st === 'failed' ? <Tag label="failed" tone="bad" />
    : st === 'running' ? <Tag label="running" tone="info" run live /> : <span className="na">not tested</span>;
}
export function TestCell({ t }: { t: J }) {
  if (!t.test) return <span className="na">{t.access?.record ? '—' : 'no test, set in the repo'}</span>;
  return <TestTag t={t} />;
}

export function ProblemCell({ t }: { t: J }) {
  const p = teamProblem(t);
  if (!p) return <span className="na">none</span>;
  return <><Tag label={p.tag} tone={p.tone} /> <span className={p.mono ? 'mono na' : 'na'}>{p.text}</span></>;
}

// A status line after a write; a failure reads as unknown text.
export function Said({ ok, msg }: { ok?: boolean; msg?: string }) {
  return msg ? <p role="status" className={ok === false ? 'unknown' : 'hint'}>{msg}</p> : null;
}
