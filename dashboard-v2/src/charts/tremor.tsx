// Adapted from the Tremor Raw KPI card, BarList, SparkAreaChart and Tracker (tremorlabs/tremor, recharts 3.10.1):
// project tokens in place of the Tremor palette, no first-paint motion, and words for every tone.
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { Card, Tag } from '../ui';
import { cx, FILL } from '../ui/tone';
import { Tip, useChartKeys, useTween } from './frame';
import type { BarListProps, ChartColor, KpiCardProps, SparkProps, TrackerProps } from './index';

const BAR: Record<ChartColor, string> = {
  'chart-1': 'bg-chart-1/25',
  'chart-2': 'bg-chart-2/25',
  'chart-3': 'bg-chart-3/25',
  'chart-4': 'bg-chart-4/25',
  'chart-5': 'bg-chart-5/25',
  'chart-muted': 'bg-chart-muted/25',
};

export function KpiCard({ label, value, format = String, delta, spark, href }: KpiCardProps) {
  const shown = useTween(value);
  return (
    <Card sm href={href}>
      <span className="flex flex-col gap-s1">
        <span className="font-head text-label font-semibold uppercase tracking-wide text-dim">{label}</span>
        <span className="flex flex-wrap items-baseline gap-s2">
          <span className="font-head text-kpi leading-tight font-bold tabular-nums">{shown == null ? '?' : format(shown)}</span>
          {delta && <Tag tone={delta.tone} label={delta.label} />}
        </span>
        {spark && <Spark label={`${label}, trend`} values={spark} />}
      </span>
    </Card>
  );
}

export function BarList({ label, items, format = String, color = 'chart-1' }: BarListProps) {
  const max = Math.max(0, ...items.map((i) => i.value));
  return (
    <ul aria-label={label} className="m-0 flex list-none flex-col gap-s1 p-0">
      {items.map((it) => (
        <li key={it.name} className="flex items-center gap-s3 text-sub">
          <span className="relative min-w-0 flex-1">
            <span
              className={cx('absolute inset-y-0 left-0 rounded-sm transition-all duration-300', BAR[color])}
              style={{ width: `${max > 0 ? (it.value / max) * 100 : 0}%` }}
            />
            <span className="relative block truncate px-s2 py-s1">
              {it.href ? (
                <a className="text-link" href={it.href}>
                  {it.name}
                </a>
              ) : (
                it.name
              )}
            </span>
          </span>
          <span className="shrink-0 text-ink tabular-nums">{format(it.value)}</span>
        </li>
      ))}
    </ul>
  );
}

export function Spark({ label, values, color = 'chart-1' }: SparkProps) {
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div role="img" aria-label={label} className="h-s6 w-full">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 120, height: 24 }}>
        <AreaChart data={data} margin={{ top: 2, right: 1, bottom: 1, left: 1 }} accessibilityLayer={false}>
          <Area
            dataKey="v"
            type="linear"
            connectNulls={false}
            isAnimationActive={false}
            stroke={`var(--${color})`}
            fill={`var(--${color})`}
            fillOpacity={0.15}
            strokeWidth={1.5}
            dot={false}
            activeDot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Tracker({ label, items }: TrackerProps) {
  const go = (i: number) => {
    const href = items[i]?.href;
    if (href) location.assign(href);
  };
  const k = useChartKeys(items.length, go);
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it.label, (counts.get(it.label) ?? 0) + 1);
  const summary = items.length
    ? `${label}: ${[...counts].map(([w, n]) => `${n} ${w}`).join(', ')}`
    : `${label}: none yet`;
  const tip = k.active == null ? null : `${k.active + 1} of ${items.length}: ${items[k.active]?.label}`;
  return (
    <div className="relative">
      <div role="img" aria-label={summary} className="flex h-s6 gap-px" {...k.keys}>
        {items.map((it, i) => (
          <span
            key={i}
            title={it.label}
            onMouseEnter={() => k.setActive(i)}
            onMouseLeave={() => k.setActive(null)}
            className={cx('min-w-0 flex-1 rounded-sm', FILL[it.tone], k.active === i && 'opacity-60')}
          />
        ))}
      </div>
      <Tip text={tip} />
    </div>
  );
}
