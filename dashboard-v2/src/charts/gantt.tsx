// The Gantt for the session timeline and the runner timeline: SVG with a d3-scale time axis.
import { scaleLinear } from 'd3-scale';
import { cx, SVG } from '../ui/tone';
import { Frame, NoData, timeLabel, useChartKeys, useWidth } from './frame';
import type { GanttProps, GanttRow } from './index';

const LABEL = 132;
const ROW = 26;
const AXIS = 20;
const TOP = 14;

export function Gantt({ title, summary, table, rows, start, end, now, lines = [], selected, onSelect }: GanttProps) {
  const [ref, width] = useWidth();
  const k = useChartKeys(rows.length, (i) => {
    const id = rows[i]?.id;
    if (id != null) onSelect?.(id);
  });
  const span = Math.max(1, end - start);
  const x = scaleLinear().domain([start, end]).range([LABEL, Math.max(LABEL + 1, width - 8)]).clamp(true);
  const height = TOP + rows.length * ROW + AXIS;
  const time = (t: number) => timeLabel(t, span);
  const say = (r: GanttRow) =>
    `${r.label}: ${r.bars.map((b) => `${b.label} ${time(b.start)} to ${time(b.end)}`).join(', ') || 'no runs'}`;
  const tip = k.active == null ? null : say(rows[k.active]!);
  return (
    <Frame title={title} summary={summary} table={table} keys={k.keys} tip={tip}>
      <div ref={ref}>
        {rows.length === 0 ? (
          <NoData />
        ) : (
          <svg width={width} height={height} className="block overflow-visible">
            {lines.map((l) => (
              <g key={`l${l.at}${l.label}`}>
                <line x1={x(l.at)} x2={x(l.at)} y1={TOP - 4} y2={height - AXIS} className="stroke-line2" strokeDasharray="3 3" />
                <text x={x(l.at)} y={TOP - 6} textAnchor="middle" className="fill-faint text-tiny">
                  {l.label}
                </text>
              </g>
            ))}
            {rows.map((r, i) => {
              const y = TOP + i * ROW;
              const on = r.id === selected || k.active === i;
              return (
                <g key={r.id} onClick={() => onSelect?.(r.id)} onMouseEnter={() => k.setActive(i)} className={onSelect ? 'cursor-pointer' : undefined}>
                  <rect x={0} y={y} width={width} height={ROW} className={on ? 'fill-infobg' : 'fill-transparent'} />
                  <text x={4} y={y + ROW / 2} dominantBaseline="middle" className={cx('text-tiny', r.tone ? SVG[r.tone] : 'fill-ink')}>
                    {r.label.length > 20 ? r.label.slice(0, 19) + '…' : r.label}
                  </text>
                  {r.bars.map((b, j) => {
                    const cut = r.cap != null && b.end > r.cap ? Math.max(b.start, r.cap) : b.end;
                    return (
                      <g key={j}>
                        <rect x={x(b.start)} y={y + 6} width={Math.max(1, x(cut) - x(b.start))} height={ROW - 12} rx={2} className={b.tone ? SVG[b.tone] : 'fill-info'} />
                        {cut < b.end && <rect x={x(cut)} y={y + 6} width={Math.max(1, x(b.end) - x(cut))} height={ROW - 12} rx={2} className="fill-bad" />}
                      </g>
                    );
                  })}
                  {r.cap != null && <line x1={x(r.cap)} x2={x(r.cap)} y1={y + 3} y2={y + ROW - 3} className="stroke-bad" strokeWidth={2} />}
                  {r.marks?.map((m) => (
                    <path key={`${m.at}${m.label}`} d={`M${x(m.at)},${y + 3} l-4,-3 h8 z`} className="fill-ink">
                      <title>{m.label}</title>
                    </path>
                  ))}
                </g>
              );
            })}
            {now != null && <line x1={x(now)} x2={x(now)} y1={TOP - 4} y2={height - AXIS} className="stroke-info" strokeWidth={1.5} />}
            <line x1={LABEL} x2={width - 8} y1={height - AXIS} y2={height - AXIS} className="stroke-line" />
            {x.ticks(Math.max(2, Math.floor((width - LABEL) / 90))).map((t) => (
              <text key={t} x={x(t)} y={height - 6} textAnchor="middle" className="fill-faint text-tiny">
                {time(t)}
              </text>
            ))}
          </svg>
        )}
      </div>
    </Frame>
  );
}
