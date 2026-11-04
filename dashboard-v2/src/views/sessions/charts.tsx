// The Sessions view's pictures: the session timeline, the countdown rings, usage by model, and the Answers columns.
import { Gantt } from '../../charts';
import type { GanttMark, GanttRow } from '../../charts';
import { ChartFrame, Frame, NoData, useChartKeys, useWidth } from '../../charts/frame';
import { short, stamp, tokn } from '../../format';
import type { J } from '../../model/base';
import { sessTabOf } from '../../model/sessions';
import type { Tone } from '../../ui';
import { cx, SVG } from '../../ui/tone';
import { isLive, num } from './data';

// One row per session in the chain, oldest first: boot, then the run to its stop (or now), with the cap at the sandbox end.
export function Timeline({ chain, now, maxRun, pauseAt, sel }: { chain: J[]; now: number; maxRun: number | null; pauseAt: number | null; sel: string }) {
  const rows: GanttRow[] = [], lines: GanttMark[] = [];
  const data = [...chain].reverse().filter((y) => num(y.created) != null);
  for (const y of data) {
    const c = Number(y.created), boot = num(y.boot_s), up = num(y.booted_at) ?? (boot != null ? c + boot : null);
    const end = isLive(y) ? now : (num(y.stopped_at) ?? num(y.last_activity) ?? up ?? c);
    const busy = num(y.busy_s), idle = num(y.idle_s);
    const run = busy != null && idle != null ? `run, ${short(busy)} busy, ${short(idle)} idle` : isLive(y) ? 'running' : 'run';
    rows.push({
      id: y.key, label: y.key, tone: isLive(y) ? 'info' : undefined,
      bars: [...(up != null && up > c ? [{ start: c, end: up, tone: 'dim' as const, label: 'boot' }] : []), { start: up ?? c, end: Math.max(end, up ?? c), tone: isLive(y) ? ('info' as const) : ('dim' as const), label: run }],
      cap: up != null && maxRun != null ? up + maxRun : undefined,
    });
  }
  const head = data[data.length - 1];
  if (pauseAt != null) lines.push({ at: pauseAt, label: 'idle pause' });
  if (!rows.length) return null;
  // The live head's cap is the sandbox end, so the axis runs to it.
  const cap = head && isLive(head) ? rows[rows.length - 1]!.cap : undefined;
  const start = Math.min(...rows.map((r) => r.bars[0]!.start)), end = Math.max(...rows.flatMap((r) => r.bars.map((b) => b.end)), ...lines.map((l) => l.at), cap ?? 0);
  const table = { head: ['Session', 'Started', 'Ended', 'Boot', 'Busy', 'Idle'], rows: data.map((y) => [y.key, stamp(y.created), isLive(y) ? 'running' : stamp(num(y.stopped_at)), short(num(y.boot_s)), short(num(y.busy_s)), short(num(y.idle_s))]) };
  return (
    <Gantt title="Session timeline" summary={`${rows.length} session${rows.length === 1 ? '' : 's'}, from ${stamp(start)} to ${stamp(end)}.`} table={table}
      rows={rows} start={start} end={Math.max(end, start + 60)} now={head && isLive(head) ? now : undefined} lines={lines} selected={sel}
      onSelect={(id) => { const y = data.find((z) => z.key === id); if (y) location.hash = `#sessions/${sessTabOf(y)}/${y.key}`; }} />
  );
}

// A countdown ring with the time left as text inside it.
export function Ring({ left, total, label }: { left: number; total: number; label: string }) {
  const r = 17, c = 2 * Math.PI * r, f = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
  const tone: Tone = left < 300 ? 'warn' : 'info';
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" role="img" aria-label={`${label}: ${short(left)}`}>
      <circle cx="22" cy="22" r={r} fill="none" strokeWidth="4" className="stroke-sunk" />
      <circle cx="22" cy="22" r={r} fill="none" strokeWidth="4" className={tone === 'warn' ? 'stroke-warn' : 'stroke-info'}
        strokeDasharray={`${c * f} ${c}`} transform="rotate(-90 22 22)" />
      <text x="22" y="22" textAnchor="middle" dominantBaseline="central" className="fill-ink text-tiny">{short(left)}</text>
    </svg>
  );
}

const PARTS = [['cache_read', 'Cache read', 'bg-chart-1'], ['cache_write', 'Cache write', 'bg-chart-2'], ['input', 'Input', 'bg-chart-3'], ['output', 'Output', 'bg-chart-4']] as const;
// Tokens by kind for each model, beside the usage table.
export function UseBars({ rows }: { rows: J[] }) {
  const sum = (r: J) => PARTS.reduce((n, [k]) => n + (Number(r[k]) || 0), 0), max = Math.max(1, ...rows.map(sum));
  const table = { head: ['Model', ...PARTS.map((p) => p[1])], rows: rows.map((r) => [String(r.model ?? 'unknown'), ...PARTS.map(([k]) => tokn(r[k]))]) };
  const top = rows.reduce((a: J, r: J) => (sum(r) > sum(a ?? {}) ? r : a), null);
  return (
    <ChartFrame title="Tokens by kind" summary={`Tokens of ${rows.length} model${rows.length === 1 ? '' : 's'}. Most: ${top?.model ?? 'none'}, ${tokn(top ? sum(top) : 0)}.`} table={table}>
      {rows.map((r, i) => (
        <div key={i} className="mb-s1">
          <div className="text-tiny text-dim">{String(r.model ?? 'unknown')}</div>
          <div className="usebar" style={{ width: `${(sum(r) / max) * 100}%` }}>
            {PARTS.map(([k, , c]) => <i key={k} className={c} style={{ width: `${((Number(r[k]) || 0) / Math.max(1, sum(r))) * 100}%` }} />)}
          </div>
        </div>
      ))}
      <div className="uselegend" aria-hidden>{PARTS.map(([k, l, c]) => <span key={k}><i className={c} />{l}</span>)}</div>
    </ChartFrame>
  );
}

export type Col = { label: string; parts: { tone: Tone; label: string; value: number }[] };
// Stacked columns: each part has its tone and its word; one tab stop, arrows move between columns.
export function Columns({ title, summary, cols }: { title: string; summary: string; cols: Col[] }) {
  const k = useChartKeys(cols.length);
  const [ref, W] = useWidth(300);
  const H = 120, B = 16, max = Math.max(1, ...cols.map((c) => c.parts.reduce((n, p) => n + p.value, 0)));
  const w = W / Math.max(1, cols.length), words = [...new Set(cols.flatMap((c) => c.parts.map((p) => p.label)))];
  const table = { head: ['', ...words, 'Total'], rows: cols.map((c) => [c.label, ...words.map((x) => c.parts.find((p) => p.label === x)?.value ?? 0), c.parts.reduce((n, p) => n + p.value, 0)]) };
  const tip = k.active == null ? null : `${cols[k.active]!.label}: ${cols[k.active]!.parts.filter((p) => p.value).map((p) => `${p.value} ${p.label}`).join(', ') || 'none'}`;
  return (
    <Frame title={title} summary={summary} table={table} keys={k.keys} tip={tip}>
      <div ref={ref}>
      {cols.length ? (
        <svg width={W} height={H + B} className="block">
          {cols.map((c, i) => {
            let y = H;
            return (
              <g key={c.label} onMouseEnter={() => k.setActive(i)} onMouseLeave={() => k.setActive(null)}>
                {c.parts.map((p) => {
                  const h = (p.value / max) * (H - 4);
                  y -= h;
                  return h > 0 ? <rect key={p.label} x={i * w + Math.max(1, (w - 40) / 2)} y={y} width={Math.max(1, Math.min(40, w - 2))} height={h} className={cx(SVG[p.tone], k.active === i && 'opacity-60')} /> : null;
                })}
                {(w >= 64 || i === 0 || i === cols.length - 1) && <text x={i * w + w / 2} y={H + 12} textAnchor="middle" className="fill-dim text-tiny">{c.label}</text>}
              </g>
            );
          })}
          <line x1="0" x2={W} y1={H} y2={H} className="stroke-line" />
        </svg>
      ) : <NoData />}
      </div>
    </Frame>
  );
}
