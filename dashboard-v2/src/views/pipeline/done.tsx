// The Done tab (v1 doneHtml): tiles, the line, the merges per week, and the table, which sorts by column.
import { useState } from 'react';
import { BarList, StripPlot } from '../../charts';
import { days, jiraHref, prUrl, usd } from '../../format';
import type { J } from '../../model/base';
import { SNAP, jiraSite, laneTitle, teamRepo } from '../../model/pipeline';
import { useApp } from '../../store';
import { Card, EmptyBox } from '../../ui';
import { doneRows, median, weekOf } from './data';
import { Ext, Tile } from './parts';

type Col = 'key' | 'title' | 'merged' | 'took' | 'by' | 'cost';
const COLS: [Col, string][] = [['key', 'Ticket'], ['title', 'Title'], ['merged', 'Merged'], ['took', 'Days to merge'], ['by', 'Merged by'], ['cost', 'Cost']];

export function Done() {
  const s = useApp((x) => x), snap = SNAP(s), tickets = (s.feeds.stats?.data as J)?.tickets;
  const [sort, setSort] = useState<{ col: Col; up: boolean }>({ col: 'merged', up: false });
  const prs = snap?.merged_prs, rows = doneRows(snap), lbl = snap?.team?.pr_label, cap = snap?.limits?.merged_prs ?? prs?.length ?? 0;
  if (!snap) return <div id="s-done"><EmptyBox>Loading the pipeline…</EmptyBox></div>;
  if (prs == null) return <div id="s-done"><EmptyBox>Could not read merged PRs from GitHub.</EmptyBox></div>;
  if (!rows.length) return <div id="s-done"><EmptyBox>No merged ticket yet.</EmptyBox></div>;
  const wk = rows.filter((r) => (days(r.merged) ?? 99) < 7).length, med = median(rows.map((r) => r.took));
  const medText = med == null ? '—' : Math.round(med) === 0 ? 'under 1' : Math.round(med);
  const cost = (r: J): number | null => tickets?.[r.t.key]?.cost ?? null;
  const val: Record<Col, (r: J) => string | number> = {
    key: (r) => r.t.key, title: (r) => laneTitle(r.t.summary).text, merged: (r) => Date.parse(r.merged), took: (r) => (Number.isFinite(r.took) ? r.took : -1),
    by: (r) => r.by ?? '', cost: (r) => cost(r) ?? -1,
  };
  const f = val[sort.col], sorted = rows.slice().sort((a, b) => {
    const x = f(a), y = f(b), c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    return sort.up ? c : -c;
  });
  // Merges per local week, oldest first, with the days to merge of each ticket.
  const weeks = new Map<number, { label: string; rows: J[] }>();
  rows.slice().reverse().forEach((r) => { const w = weekOf(r.merged), e = weeks.get(w.at) ?? { label: w.label, rows: [] }; e.rows.push(r); weeks.set(w.at, e); });
  const ws = [...weeks.values()], by = new Map<string, number>();
  rows.forEach((r) => by.set(r.by || 'unknown', (by.get(r.by || 'unknown') ?? 0) + 1));
  return (
    <div id="s-done">
      <div className="ptiles">
        <Tile label="Tickets merged" value={rows.length} sub={`from the last ${cap} merged PRs`} />
        <Tile label="Merged, 7 days" value={wk} sub={wk === 1 ? 'ticket' : 'tickets'} />
        <Tile label="Median days to merge" value={medText} sub="from the PR's creation" />
      </div>
      <p className="bwhere" id="dline">{rows.length} ticket{rows.length === 1 ? '' : 's'} from the last {cap} merged PRs{lbl ? ` labelled ${lbl}` : ''}, newest first.</p>
      <div className="pflow-grid">
        <Card flat sm>
          <h3 className="sgroup">Merges per week</h3>
          <BarList label="Merges per week" items={ws.map((w) => ({ name: `Week of ${w.label}`, value: w.rows.length }))} color="chart-3" />
          <StripPlot title="Days to merge, per week" unit="days"
            summary={`Days to merge per week of the merge. The median of all is ${medText} days.`}
            groups={ws.map((w) => ({ label: w.label, median: median(w.rows.map((r) => r.took)) ?? undefined,
              points: w.rows.filter((r) => Number.isFinite(r.took)).map((r) => ({ value: Math.round(r.took * 10) / 10, label: r.t.key })) }))}
            table={{ head: ['Week of', 'Ticket', 'Days to merge'], rows: ws.flatMap((w) => w.rows.map((r) => [w.label, r.t.key, Math.round(r.took * 10) / 10])) }} />
        </Card>
        <Card flat sm>
          <h3 className="sgroup">Merged by</h3>
          <BarList label="Merged by" items={[...by].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }))} color="chart-2" />
        </Card>
      </div>
      <div className="tscroll">
        <table className="dtab">
          <caption className="sr-only">Merged tickets</caption>
          <thead>
            <tr>
              {COLS.map(([c, name]) => (
                <th key={c} scope="col" aria-sort={sort.col === c ? (sort.up ? 'ascending' : 'descending') : undefined}>
                  <button type="button" className="linkbtn" onClick={() => setSort({ col: c, up: sort.col === c ? !sort.up : c !== 'merged' })}>{name}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const t = r.t, took = Math.round(r.took), d = r.ago, c = cost(r);
              return (
                <tr key={t.key}>
                  <td><Ext className="key" href={jiraHref(t.key, jiraSite(s, t.key))}>{t.key}</Ext>{t.pr != null && <> <Ext className="key" href={prUrl(t.pr, teamRepo(s, t.key))}>#{t.pr}</Ext></>}</td>
                  <td>{laneTitle(t.summary).text}</td>
                  <td title={new Date(Date.parse(r.merged)).toLocaleString()}>{d === 0 ? 'today' : `${d} day${d === 1 ? '' : 's'} ago`}</td>
                  <td>{Number.isFinite(took) ? took : '—'}</td>
                  <td>{r.by || '—'}</td>
                  <td>{c == null ? (tickets ? '—' : '?') : usd(c)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
