// The Stats filters, in the side panel. Each control stays mounted, so the focus stays on the one that changed.
import { useEffect, useMemo, useState } from 'react';
import { modelName } from '../../format';
import type { J } from '../../model/base';
import { STATS_RANGES } from '../../model/stats';
import { teamLabel } from '../../model/teams';
import { store, useApp } from '../../store';
import { SF_DEFAULT } from '../../store/prefs';
import type { StatsFilter } from '../../store/types';
import { isFiltered, KIND, SF_SRC, setFilter, STATS_USES, tabOf, useFilter } from './filter';

const SEARCH_MS = 250;

export function Side() {
  const tab = tabOf(useApp((s) => s.route.tab));
  const data = useApp((s) => s.feeds.stats?.data) as J;
  useApp((s) => s.feeds.teams);
  const sf = useFilter();
  const use = (f: keyof StatsFilter) => STATS_USES[tab].includes(f);
  const all: J[] = useMemo(() => data?.rows ?? [], [data]);
  const teams = useMemo(() => [...new Set(all.map((r) => r.profile || 'fxa'))].sort() as string[], [all]);
  const kinds = useMemo(() => [...new Set(all.filter((r) => sf.src === 'all' || r.src === sf.src).map((r) => r.kind).filter(Boolean))].sort() as string[], [all, sf.src]);
  // A run's priced parts name models too, so a subagent model is a choice.
  const models = useMemo(() => [...new Set(all.flatMap((r) => [r.model, ...Object.keys(r.models ?? {})]).filter(Boolean))].sort() as string[], [all]);
  const src = tab === 'prs' ? { pipeline: SF_SRC.pipeline!, slack: SF_SRC.slack! } : SF_SRC;
  const sel = (f: keyof StatsFilter, v: string) => setFilter({ [f]: v, ...(f === 'src' ? { kind: 'all' } : {}) });
  const badDates = sf.range === 'custom' && sf.from && sf.to && sf.from > sf.to;

  return (
    <>
      <div className="sh"><h2>Filters</h2></div>
      {!data ? <p className="empty sgroup">loading…</p> : (
        <div className="st-filters">
          <div className="st-fl" role="group" aria-label="Date range">
            <span>Range</span>
            <div className="st-seg">
              {STATS_RANGES.map(([k, l]) => (
                <button key={k} type="button" data-range={k} aria-pressed={sf.range === k} onClick={() => setFilter({ range: k })}>{l}</button>
              ))}
            </div>
          </div>
          {sf.range === 'custom' && (
            <>
              <label>From <input type="date" data-f="from" value={sf.from} max={sf.to || undefined} onChange={(e) => setFilter({ from: e.target.value })} /></label>
              <label>To <input type="date" data-f="to" value={sf.to} min={sf.from || undefined} onChange={(e) => setFilter({ to: e.target.value })} /></label>
              {badDates && <p className="st-err" role="alert">From is after To: pick a From day on or before the To day.</p>}
            </>
          )}
          {use('src') && (
            <label>Source
              <select data-f="src" value={sf.src} onChange={(e) => sel('src', e.target.value)}>
                <option value="all">All sources</option>
                {Object.entries(src).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          )}
          {use('kind') && (
            <label>Kind
              <select data-f="kind" value={sf.kind} onChange={(e) => sel('kind', e.target.value)}>
                <option value="all">All kinds</option>
                {kinds.map((k) => <option key={k} value={k}>{KIND[k] ?? k}</option>)}
              </select>
            </label>
          )}
          {use('team') && teams.length > 1 && (
            <label>Team
              <select data-f="team" value={sf.team} onChange={(e) => sel('team', e.target.value)}>
                <option value="all">All teams</option>
                {teams.map((t) => <option key={t} value={t}>{teamLabel(store.getState(), t)}</option>)}
              </select>
            </label>
          )}
          {use('model') && (
            <label>Model
              <select data-f="model" value={sf.model} onChange={(e) => sel('model', e.target.value)}>
                <option value="all">All models</option>
                {models.map((m) => <option key={m} value={m}>{modelName(m)}</option>)}
              </select>
            </label>
          )}
          {use('q') && <Search q={sf.q} />}
          {isFiltered(sf) && <button type="button" data-reset onClick={() => setFilter({ ...SF_DEFAULT })}>Clear filters</button>}
        </div>
      )}
    </>
  );
}

// The search filters as you type, after a short pause, so a long log does not redraw on each key.
function Search({ q }: { q: string }) {
  const [v, setV] = useState(q);
  const [prev, setPrev] = useState(q);
  if (q !== prev) { setPrev(q); setV(q); }
  useEffect(() => {
    if (v === q) return;
    const t = setTimeout(() => setFilter({ q: v }), SEARCH_MS);
    return () => clearTimeout(t);
  }, [v, q]);
  return (
    <label>Ticket or session
      <input type="search" data-f="q" placeholder="FXA-… or agent-…" value={v} onChange={(e) => setV(e.target.value)} />
    </label>
  );
}
