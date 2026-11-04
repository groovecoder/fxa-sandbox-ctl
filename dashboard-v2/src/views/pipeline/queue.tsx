// The Queue and review tab (v1 renderTickets): tiles, the review lists with the wait strip, and the queue groups.
import type { ReactNode } from 'react';
import { BarList, ChartFrame, StripPlot } from '../../charts';
import { days, jiraHref, prUrl } from '../../format';
import { isWaitingOnHuman, skipGroups, verdictTag } from '../../model';
import type { J } from '../../model/base';
import { SNAP, jiraSite, laneTitle, teamRepo } from '../../model/pipeline';
import { MODEL, useParts } from '../../app/store';
import type { Store } from '../../store/types';
import { Card, CheckBars, EmptyBox, Tag } from '../../ui';
import { cx } from '../../ui/tone';
import { WAIT_BINS, waitDays } from './data';
import { Ext, SrcBadge, Tile, useOpen } from './parts';

const byWait = (a: J, b: J) => (Date.parse(a.last_human_review?.at ?? a.created ?? a.updated) || 0) - (Date.parse(b.last_human_review?.at ?? b.created ?? b.updated) || 0);
// The verdict tones as words, for the strip rows.
const TONE_ROW: Record<string, string> = { ok: 'Green or approved', info: 'CI running', warn: 'No PR, closed or infra red', bad: 'Red or changes requested', '': 'Draft or no checks', merged: 'Merged' };

function Key({ s, k }: { s: Store; k: string }) {
  return <Ext className="key" href={jiraHref(k, jiraSite(s, k))}>{k}</Ext>;
}
const Title = ({ t }: { t: string }) => <span className="title" title={t}>{t}</span>;

function WaitAge({ r }: { r: J }) {
  const h = r.last_human_review, since = h ? days(h.at) : days(r.created ?? r.updated);
  if (since == null) return null;
  const req = (r.reviewers ?? []).map((x: string) => x.replace(/^mozilla\//, '')).join(', ');
  return (
    <>
      <span className={cx('age', since >= 3 && 'old')}>{Math.round(since)}d</span>
      <span>{h ? `since ${h.login}'s review` : 'no human review yet'}</span>
      {req && <span>· requested {req}</span>}
    </>
  );
}

function ReviewRow({ s, r }: { s: Store; r: J }) {
  const v = verdictTag(r), ph = prUrl(r.pr, teamRepo(s, r.key));
  return (
    <div className="item qi">
      <SrcBadge kind={r.pr ? 'github' : 'jira'} />
      <div className="line1">
        <Key s={s} k={r.key} />
        <Title t={r.title ? laneTitle(r.title).text : r.pr ? 'title unavailable' : 'no PR found'} />
        {v && <Tag label={v.label} tone={v.tone || undefined} run={v.run} title={v.title} />}
      </div>
      <div className="line2">
        {r.pr ? <Ext className="key" href={ph}>#{r.pr}</Ext> : 'no PR on this branch'}{' '}
        {(r.ok ?? 0) + (r.fail ?? 0) + (r.running ?? 0) > 0 && <CheckBars ok={r.ok ?? 0} fail={r.fail ?? 0} running={r.running ?? 0} />} <WaitAge r={r} />
      </div>
    </div>
  );
}

// Dots sized by passes: a ticket that a pass skipped often stands out in its group.
function Passes({ ks }: { ks: J[] }) {
  return (
    <svg className="ppass" width={ks.length * 16} height={14} aria-hidden="true">
      {ks.map((k, i) => <circle key={k.key} cx={i * 16 + 7} cy={7} r={Math.min(7, 2 + (k.passes ?? 0))} className="fill-chart-2" />)}
    </svg>
  );
}

function Details({ name, def, summary, children }: { name: string; def: boolean; summary: string; children: ReactNode }) {
  const o = useOpen(`queue:${name}`, def);
  return (
    <details data-k={name} open={o.open} onToggle={o.onToggle}>
      <summary>{summary}</summary>
      <div className="body">{children}</div>
    </details>
  );
}

export function Queue() {
  const s = useParts(MODEL), snap = SNAP(s);
  if (!snap) return <EmptyBox>Loading the pipeline…</EmptyBox>;
  const review: J[] | null = snap.review ?? null, waiting = review ? review.filter(isWaitingOnHuman) : [];
  const others = review ? review.filter((r) => !isWaitingOnHuman(r)) : [];
  const q = snap.queue ?? {}, ready: J[] = q.ready ?? [], skipped: J[] = q.skipped ?? [];
  // A hold waits for another ticket to merge; it is not launchable, and not a skip a person must answer.
  const held = skipped.filter((k) => k.in_queue !== false && k.held_by), live = skipped.filter((k) => k.in_queue !== false && !k.held_by), stale = skipped.filter((k) => k.in_queue === false);
  const stuck = others.filter((r) => r.state !== 'MERGED').length, qv = (x: number) => (q.fetch_failed ? null : x), rv = (x: number) => (review == null ? null : x);
  const off = snap.mode?.newtickets === 'off';
  const kinds = [['draft', others.filter((r) => r.draft).length], ['closed or merged', others.filter((r) => r.state === 'CLOSED' || r.state === 'MERGED').length],
    ['no PR', others.filter((r) => r.pr == null).length]].filter(([, n]) => n).map(([w, n]) => `${n} ${w}`);
  const skipRow = (k: J) => (
    <div className="item qi" key={k.key}>
      <SrcBadge kind="jira" />
      <div className="line1"><Key s={s} k={k.key} /><Title t={k.summary ?? ''} />
        <span>{k.in_focus === false && k.in_queue !== false && <Tag label="outside the focus" />}<Tag label={`${k.passes}×`} /></span></div>
      <div className="line2 reason" title={k.reason}>{k.reason}</div>
    </div>
  );
  const jiraRow = (t: J, tag?: ReactNode) => (
    <div className="item qi" key={t.key}>
      <SrcBadge kind="jira" />
      <div className="line1"><Key s={s} k={t.key} /><Title t={t.summary ?? ''} /><span>{tag}</span></div>
    </div>
  );
  return (
    <>
      <div id="s-review">
        <div className="ptiles">
          <Tile label="Waiting on a reviewer" value={rv(waiting.length)} sub={review == null ? 'a feed failed' : `${review.length} in review`} tone={waiting.length ? 'warn' : undefined} />
          <Tile label="Stuck in review" value={rv(stuck)} sub="CI red, conflicts, or changes requested" tone={stuck ? 'bad' : undefined} />
          <Tile label="Launchable" value={qv(ready.length)}
            sub={q.fetch_failed ? 'Jira did not answer' : `${off ? 'intake is off' : ready[0] ? `next up ${ready[0].key}` : 'nothing to launch'}${held.length ? ` · ${held.length} held on another ticket` : ''}`} />
          <Tile label="Waits on a person" value={qv(live.length)} sub={q.fetch_failed ? 'Jira did not answer' : 'skipped, each waits on an answer in Jira'} tone={live.length ? 'warn' : undefined} />
        </div>
        {review == null ? (
          <div className="headline"><span className="big">?</span><span className="cap">{snap.done_fetch_failed ? 'Jira' : 'GitHub'} fetch failed; unknown, not zero</span></div>
        ) : (
          <>
            <h2 className="qh">Waiting on a reviewer<span className="n">{waiting.length}</span><span className="note">oldest wait first</span></h2>
            {review.length === 0 ? <div className="empty">nothing awaiting review</div> : (
              <>
                {waiting.slice().sort(byWait).map((r) => <ReviewRow key={r.key} s={s} r={r} />)}
                {others.length > 0 && (
                  <>
                    <h2 className="qh">Not waiting on a reviewer<span className="n">{others.length}</span>
                      <span className="note">{[stuck && `${stuck} with CI red, conflicts or changes requested`, ...kinds].filter(Boolean).join(', ')}</span></h2>
                    {others.slice().sort(byWait).map((r) => <ReviewRow key={r.key} s={s} r={r} />)}
                  </>
                )}
                <WaitStrip review={review} />
              </>
            )}
          </>
        )}
      </div>
      <div id="s-queue">
        <h2 className="qh">Queue<span className="sub">{snap.team?.queue_label ? `labelled ${snap.team.queue_label}` : 'in the queue'}</span>
          <span className="n">{q.fetch_failed ? '?' : ready.length + live.length}</span>
          {!q.fetch_failed && <span className="note">{ready.length} launchable{held.length ? `, plus ${held.length} held` : ''}</span>}</h2>
        {q.fetch_failed ? <div className="unknown">Jira fetch failed; unknown, not zero</div> : (
          <>
            <QueueBar ready={ready} held={held} live={live} stale={stale} />
            {off ? (
              <>
                <div className="empty">intake is off: the passes work on open PRs only and launch nothing from this queue</div>
                {ready.length > 0 && <Details name="launchable" def={false} summary={`${ready.length} launchable, oldest first`}>{ready.map((t) => jiraRow(t))}</Details>}
              </>
            ) : ready.length === 0 ? <div className="empty">nothing launchable right now</div> : (
              <>
                {ready.slice(0, 5).map((t, i) => jiraRow(t, i === 0 ? <Tag label="next up" tone="info" /> : null))}
                {ready.length > 5 && <div className="empty">+ {ready.length - 5} more launchable</div>}
              </>
            )}
            {held.length > 0 && (
              <Details name="held" def summary={`${held.length} held, waiting on another ticket to merge`}>
                {held.map((k) => (
                  <div className="item qi" key={k.key}>
                    <SrcBadge kind="jira" />
                    <div className="line1"><Key s={s} k={k.key} /><Title t={k.summary ?? ''} /><span><Tag label={`waiting on ${k.held_by}`} tone="info" /></span></div>
                    <div className="line2 reason" title={k.reason}>{k.reason}</div>
                  </div>
                ))}
              </Details>
            )}
            {live.length > 0 && (
              <Details name="skipped" def={!ready.length} summary={`${live.length} skipped, each waits on a person's answer in Jira`}>
                {skipGroups(live).map(([g, ks]) => (
                  <div key={g}>
                    <h3 className="sgroup">{g} <span className="n">{ks.length}</span> <Passes ks={ks} /></h3>
                    {ks.map(skipRow)}
                  </div>
                ))}
              </Details>
            )}
            {stale.length > 0 && (
              <Details name="staleskips" def={false}
                summary={`${stale.length} skip record${stale.length > 1 ? 's' : ''} for tickets that left the queue (resolved or unlabelled); pruned on the next reconcile`}>
                {stale.map(skipRow)}
              </Details>
            )}
          </>
        )}
      </div>
    </>
  );
}

// One dot per PR on an axis of wait days, a row per verdict tone, and the waits in bins beside it.
function WaitStrip({ review }: { review: J[] }) {
  const pts = review.map((r) => ({ r, d: waitDays(r), v: verdictTag(r) })).filter((p) => p.d != null) as { r: J; d: number; v: { label: string; tone: string } }[];
  if (!pts.length) return null;
  const rows = [...new Set(pts.map((p) => p.v.tone))].map((tone) => ({
    label: TONE_ROW[tone] ?? tone, points: pts.filter((p) => p.v.tone === tone).map((p) => ({ value: Math.round(p.d * 10) / 10, label: `${p.r.key}, ${p.v.label}` })),
  }));
  const old = pts.filter((p) => p.d >= 3).length;
  const bins = WAIT_BINS.map(([name, lo, hi]) => ({ name, value: pts.filter((p) => p.d >= lo && p.d < hi).length }));
  return (
    <Card flat sm className="pwait">
      <StripPlot title="Review waits" unit="days" groups={rows}
        summary={`${pts.length} PRs in review. ${old} wait 3 days or more. The longest wait is ${Math.round(Math.max(...pts.map((p) => p.d)))} days.`}
        table={{ head: ['Ticket', 'Verdict', 'Wait in days'], rows: pts.map((p) => [p.r.key, p.v.label, Math.round(p.d * 10) / 10]) }} />
      <div>
        <h3 className="sgroup">Waits in bins</h3>
        <BarList label="Review waits in bins" items={bins} />
      </div>
    </Card>
  );
}

// The queue as one stacked bar: ready, held, the skips by reason, and the stale records.
function QueueBar({ ready, held, live, stale }: { ready: J[]; held: J[]; live: J[]; stale: J[] }) {
  const parts = [['Ready', ready.length, 'bg-chart-1'], ['Held', held.length, 'bg-chart-2'],
    ...skipGroups(live).map(([g, ks], i) => [`Skipped: ${g}`, ks.length, ['bg-chart-3', 'bg-chart-4', 'bg-chart-5', 'bg-chart-3'][i]!]), ['Stale records', stale.length, 'bg-chart-muted']]
    .filter(([, n]) => n) as [string, number, string][];
  const total = parts.reduce((t, [, n]) => t + n, 0);
  if (!total) return null;
  const text = parts.map(([w, n]) => `${n} ${w.toLowerCase()}`).join(', ');
  return (
    <ChartFrame title="Queue now" summary={`Queue: ${text}.${ready[0] ? ` Next up ${ready[0].key}.` : ''}`} table={{ head: ['Part', 'Tickets'], rows: parts.map(([w, n]) => [w, n]) }}>
      <div className="qbar">
        {parts.map(([w, n, c]) => (
          <span key={w} className={c} style={{ flexGrow: n }} title={`${w}: ${n}`} />
        ))}
      </div>
      <ul className="qlegend">
        {parts.map(([w, n, c]) => <li key={w}><i className={c} aria-hidden="true" />{w} {n}{w === 'Ready' && ready[0] ? `, next up ${ready[0].key}` : ''}</li>)}
      </ul>
    </ChartFrame>
  );
}
