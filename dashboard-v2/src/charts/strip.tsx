// The strip plot: one dot per point and a median tick, one row per group, on a d3-scale axis.
import { scaleLinear } from 'd3-scale';
import { Frame, NoData, useChartKeys, useWidth } from './frame';
import type { StripPlotProps } from './index';

const LABEL = 96;
const ROW = 28;
const AXIS = 20;

export function StripPlot({ title, summary, table, groups, unit }: StripPlotProps) {
  const [ref, width] = useWidth();
  const points = groups.flatMap((g, gi) => g.points.map((p) => ({ ...p, gi })));
  const k = useChartKeys(points.length, (i) => {
    const href = points[i]?.href;
    if (href) location.assign(href);
  });
  const max = Math.max(1, ...points.map((p) => p.value), ...groups.map((g) => g.median ?? 0));
  const x = scaleLinear().domain([0, max]).nice().range([LABEL, Math.max(LABEL + 1, width - 12)]);
  const height = groups.length * ROW + AXIS;
  const p = k.active == null ? null : points[k.active]!;
  const tip = p && `${groups[p.gi]!.label}: ${p.label}, ${p.value} ${unit}`;
  return (
    <Frame title={title} summary={summary} table={table} keys={k.keys} tip={tip}>
      <div ref={ref}>
        {points.length === 0 ? (
          <NoData />
        ) : (
          <svg width={width} height={height} className="block">
            {groups.map((g, i) => (
              <g key={g.label}>
                <text x={0} y={i * ROW + ROW / 2} dominantBaseline="middle" className="fill-dim text-tiny">
                  {g.label}
                </text>
                <line x1={LABEL} x2={width - 12} y1={i * ROW + ROW / 2} y2={i * ROW + ROW / 2} className="stroke-line" />
                {g.median != null && (
                  <line x1={x(g.median)} x2={x(g.median)} y1={i * ROW + 4} y2={i * ROW + ROW - 4} className="stroke-ink" strokeWidth={2}>
                    <title>{`Median ${g.median} ${unit}`}</title>
                  </line>
                )}
              </g>
            ))}
            {points.map((pt, i) => (
              <circle
                key={i}
                cx={x(pt.value)}
                cy={pt.gi * ROW + ROW / 2}
                r={k.active === i ? 6 : 4}
                onMouseEnter={() => k.setActive(i)}
                onClick={pt.href ? () => location.assign(pt.href!) : undefined}
                className={k.active === i ? 'fill-ink' : 'fill-chart-1'}
                fillOpacity={k.active === i ? 1 : 0.7}
              >
                <title>{`${pt.label}, ${pt.value} ${unit}`}</title>
              </circle>
            ))}
            {x.ticks(Math.max(2, Math.floor((width - LABEL) / 80))).map((t) => (
              <text key={t} x={x(t)} y={height - 6} textAnchor="middle" className="fill-faint text-tiny">
                {t} {unit}
              </text>
            ))}
          </svg>
        )}
      </div>
    </Frame>
  );
}
