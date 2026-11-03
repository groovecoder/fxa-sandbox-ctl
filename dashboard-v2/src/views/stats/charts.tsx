// The Stats bar and scatter charts: recharts marks inside the shared C3 frame, with its keyboard model and table.
import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, Scatter as Dots, ScatterChart, XAxis, YAxis, ZAxis } from 'recharts';
import type { ChartColor } from '../../charts';
import { Frame, NoData, useChartKeys, useWidth } from '../../charts/frame';

export type Series = { name: string; color: ChartColor; values: number[] };
type BarsProps = {
  title: string;
  // The words before the totals in the summary, for example "Spend per day, 30 days".
  what: string;
  labels: string[];
  series: Series[];
  format: (n: number) => string;
  height?: number;
  cap?: { v: number; label: string };
  note?: ReactNode;
  // A click or Enter on a bar, for a drill-down.
  onPick?: (i: number) => void;
  // Side by side, for series that do not add up (a peak and a wait count).
  grouped?: boolean;
};

const axis = { fontSize: 11, fill: 'var(--faint)' };
const idx = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? +v : null);

export function Bars({ title, what, labels, series, format, height = 230, cap, note, onPick, grouped }: BarsProps) {
  const [ref, width] = useWidth();
  const k = useChartKeys(labels.length, onPick);
  const tot = labels.map((_, i) => series.reduce((x, s) => x + (s.values[i] || 0), 0));
  const total = tot.reduce((a, b) => a + b, 0);
  const peak = tot.reduce((p, v, i) => (v > (tot[p] ?? -1) ? i : p), 0);
  const summary = !labels.length || !total ? `${what}: none.` : grouped
    ? `${what}. ${series.map((s) => { const i = s.values.reduce((p, v, j) => (v > (s.values[p] ?? -1) ? j : p), 0); return `${s.name} highest ${labels[i]}, ${format(s.values[i] || 0)}`; }).join('. ')}.`
    : `${what}. Total ${format(total)}. Peak ${labels[peak]}, ${format(tot[peak]!)}.`;
  const data = labels.map((l, i) => Object.fromEntries([['l', l], ...series.map((s, j) => [`s${j}`, s.values[i] || 0])]));
  const tipOf = (i: number) => `${labels[i]}: ${series.map((s) => `${s.name} ${format(s.values[i] || 0)}`).join(' · ')}`;
  const multi = series.length > 1 && !grouped;
  const table = { head: ['Bucket', ...series.map((s) => s.name), ...(multi ? ['Total'] : [])],
    rows: labels.map((l, i) => [l, ...series.map((s) => format(s.values[i] || 0)), ...(multi ? [format(tot[i]!)] : [])]) };
  const at = k.active;
  return (
    <Frame title={title} summary={summary} table={table} keys={k.keys} tip={at == null ? null : tipOf(at)} note={note}>
      <div ref={ref}>
        {!total && !cap ? <NoData>Nothing in this range.</NoData> : (
          <BarChart width={width} height={height} data={data} margin={{ top: 8, right: 6, bottom: 0, left: 0 }} accessibilityLayer={false}
            onMouseMove={(st) => k.setActive(idx(st.activeTooltipIndex))} onMouseLeave={() => k.setActive(null)}
            onClick={(st) => { const i = idx(st.activeTooltipIndex); if (i != null) onPick?.(i); }} style={onPick ? { cursor: 'pointer' } : undefined}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="l" tick={axis} tickLine={false} axisLine={{ stroke: 'var(--line2)' }} interval="preserveStartEnd" minTickGap={24} />
            <YAxis tick={axis} tickLine={false} axisLine={false} width={46} tickFormatter={(v: number) => format(v)} allowDecimals={false} />
            {cap && <ReferenceLine y={cap.v} stroke="var(--warn)" strokeDasharray="4 3" label={{ value: cap.label, position: 'insideTopRight', fontSize: 11, fill: 'var(--dim)' }} />}
            {series.map((s, j) => (
              <Bar key={s.name} dataKey={`s${j}`} name={s.name} stackId={grouped ? undefined : 'a'} fill={`var(--${s.color})`} isAnimationActive={false}
                radius={grouped || j === series.length - 1 ? [2, 2, 0, 0] : 0}>
                {data.map((_, i) => <Cell key={i} fillOpacity={at == null || at === i ? 1 : 0.45} />)}
              </Bar>
            ))}
          </BarChart>
        )}
      </div>
    </Frame>
  );
}

export type Point = { x: number; y: number; label: string };
type ScatterProps = { title: string; what: string; points: Point[]; x: { name: string; format: (n: number) => string }; y: { name: string; format: (n: number) => string } };

export function Scatter({ title, what, points, x, y }: ScatterProps) {
  const [ref, width] = useWidth();
  const k = useChartKeys(points.length);
  const p = k.active == null ? null : points[k.active];
  const summary = points.length ? `${what}: ${points.length} points. Highest ${y.name.toLowerCase()} ${y.format(points.reduce((m, q) => Math.max(m, q.y), 0))}.` : `${what}: none.`;
  const table = { head: ['Item', x.name, y.name], rows: points.map((q) => [q.label, x.format(q.x), y.format(q.y)]) };
  return (
    <Frame title={title} summary={summary} table={table} keys={k.keys} tip={p ? `${p.label}: ${x.format(p.x)}, ${y.format(p.y)}` : null}>
      <div ref={ref}>
        {!points.length ? <NoData>Nothing in this range.</NoData> : (
          <ScatterChart width={width} height={200} margin={{ top: 8, right: 10, bottom: 0, left: 0 }} accessibilityLayer={false}>
            <CartesianGrid stroke="var(--line)" />
            <XAxis type="number" dataKey="x" name={x.name} tick={axis} tickLine={false} tickFormatter={(v: number) => x.format(v)} />
            <YAxis type="number" dataKey="y" name={y.name} tick={axis} tickLine={false} width={46} tickFormatter={(v: number) => y.format(v)} />
            <ZAxis range={[36, 36]} />
            <Dots data={points} fill="var(--chart-1)" isAnimationActive={false}
              onMouseEnter={(_, i) => k.setActive(i)} onMouseLeave={() => k.setActive(null)}>
              {points.map((_, i) => <Cell key={i} fillOpacity={k.active == null || k.active === i ? 0.8 : 0.3} />)}
            </Dots>
          </ScatterChart>
        )}
      </div>
    </Frame>
  );
}
