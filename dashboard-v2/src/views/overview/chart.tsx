// One Recharts chart in the shared frame: a stacked area, lines with a band, or bars, by day or hour.
import { useState } from 'react';
import { Area, Bar, Brush, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ChartColor, ChartTable } from '../../charts';
import { Frame, useChartKeys } from '../../charts/frame';

export type Series = { key: string; name: string; color: ChartColor; dash?: boolean; mark?: 'area' | 'line' | 'bar' | 'band' };
export type Point = Record<string, unknown> & { lbl: string };

type Props = {
  title: string;
  summary: string;
  table: ChartTable;
  data: Point[];
  series: Series[];
  fmt: (v: number) => string;
  stacked?: boolean;
  height?: number;
  brush?: boolean;
  refs?: { y: number; label: string }[];
  yMax?: number;
  onPick?: (i: number) => void;
};

const val = (v: unknown) => (Array.isArray(v) ? v.map(Number) : v == null ? null : Number(v));
const word = (v: number | number[] | null, fmt: (v: number) => string) => (v == null ? 'none' : Array.isArray(v) ? v.map(fmt).join(' to ') : fmt(v));

export function OvChart({ title, summary, table, data: all, series, fmt, stacked, height = 240, brush, refs = [], yMax, onPick }: Props) {
  // The brush window, for this length of data only: a new range shows all its days again.
  const [win, setWin] = useState<{ n: number; s: number; e: number } | null>(null);
  const w = win && win.n === all.length ? win : null, from = w?.s ?? 0, data = w ? all.slice(w.s, w.e + 1) : all;
  const pick = onPick && ((i: number) => onPick(i + from));
  const k = useChartKeys(data.length, pick);
  const tipOf = (i: number) => `${data[i]!.lbl}: ${series.map((s) => `${s.name} ${word(val(data[i]![s.key]), fmt)}`).join(' · ')}`;
  // The brush has its own keys, so it sits under the chart, outside its role=img.
  const zoom = brush && all.length > 7 ? (
    <ResponsiveContainer width="100%" height={28} initialDimension={{ width: 400, height: 28 }}>
      <ComposedChart data={all} margin={{ top: 0, right: 8, bottom: 0, left: 46 }} accessibilityLayer={false}>
        <Brush dataKey="lbl" y={2} height={22} stroke="var(--line2)" fill="var(--panel)" travellerWidth={8} startIndex={from} endIndex={w?.e ?? all.length - 1}
          ariaLabel={`Zoom: ${data[0]?.lbl} to ${data.at(-1)?.lbl}`} onChange={(r) => setWin({ n: all.length, s: r.startIndex ?? 0, e: r.endIndex ?? all.length - 1 })} />
      </ComposedChart>
    </ResponsiveContainer>
  ) : undefined;
  return (
    <Frame title={title} summary={summary} table={table} keys={k.keys} tip={k.active == null ? null : tipOf(k.active)} note={zoom}>
      <div className="ovchart">
        <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 400, height }}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer={false}
            // Recharts 3 gives the index as text.
            onClick={(e) => { const i = Number(e?.activeTooltipIndex); if (pick && e?.activeTooltipIndex != null && Number.isInteger(i)) pick(i); }}
            className={onPick ? 'cursor-pointer' : undefined}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="lbl" tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis tickLine={false} axisLine={false} width={46} tickFormatter={(v: number) => fmt(v)} allowDecimals={false}
              domain={yMax != null ? [0, (max: number) => Math.min(max, yMax)] : [0, 'auto']} allowDataOverflow={yMax != null} />
            <Tooltip isAnimationActive={false} formatter={(v) => word(val(v), fmt)} cursor={{ fill: 'var(--hover)', stroke: 'var(--line2)' }}
              contentStyle={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', fontSize: 'var(--t-label)', color: 'var(--ink)' }} />
            {series.map((s) => {
              const c = `var(--${s.color})`;
              if (s.mark === 'bar') return <Bar key={s.key} dataKey={s.key} name={s.name} fill={c} stackId={stacked ? 'a' : undefined} isAnimationActive={false} radius={2} />;
              if (s.mark === 'line') return <Line key={s.key} dataKey={s.key} name={s.name} stroke={c} strokeWidth={2} strokeDasharray={s.dash ? '4 3' : undefined} dot={false} connectNulls={false} isAnimationActive={false} />;
              if (s.mark === 'band') return <Area key={s.key} dataKey={s.key} name={s.name} stroke="none" fill={c} fillOpacity={0.18} connectNulls={false} isAnimationActive={false} />;
              return <Area key={s.key} dataKey={s.key} name={s.name} stroke={c} fill={c} fillOpacity={0.35} stackId={stacked ? 'a' : undefined} type="linear" connectNulls={false} isAnimationActive={false} />;
            })}
            {refs.map((r) => <ReferenceLine key={r.label} y={r.y} stroke="var(--ink)" strokeDasharray="4 3" label={{ value: r.label, position: 'insideTopRight', className: 'ovref' }} />)}
            {k.active != null && <ReferenceLine x={data[k.active]!.lbl} stroke="var(--link)" />}

          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Frame>
  );
}
