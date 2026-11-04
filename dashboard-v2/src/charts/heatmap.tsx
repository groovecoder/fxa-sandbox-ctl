// The heatmap: a count on the sunk to chart-1 ramp, or a tone; colour-mix keeps it right in both themes.
import { cx, SVG } from '../ui/tone';
import { Frame, NoData, useChartKeys, useWidth } from './frame';
import type { HeatmapCell, HeatmapProps } from './index';

const LABEL = 44;
const HEAD = 16;
const GAP = 2;

export function Heatmap({ title, summary, table, rows, cols, cells, onCell }: HeatmapProps) {
  const [ref, width] = useWidth();
  const at = new Map<number, HeatmapCell>(cells.map((c) => [c.row * cols.length + c.col, c]));
  const k = useChartKeys(rows.length * cols.length, (i) => {
    const c = at.get(i);
    if (c) onCell?.(c);
  }, cols.length);
  const max = Math.max(0, ...cells.map((c) => c.value ?? 0));
  const size = Math.max(6, Math.min(24, Math.floor((width - LABEL) / Math.max(1, cols.length)) - GAP));
  const every = Math.ceil(cols.length / Math.max(1, Math.floor((width - LABEL) / 28)));
  const word = (i: number) => `${rows[Math.floor(i / cols.length)]}, ${cols[i % cols.length]}: ${at.get(i)?.label ?? 'no data'}`;
  return (
    <Frame title={title} summary={summary} table={table} keys={k.keys} tip={k.active == null ? null : word(k.active)}>
      <div ref={ref}>
        {rows.length === 0 || cols.length === 0 ? (
          <NoData />
        ) : (
          <svg width={width} height={HEAD + rows.length * (size + GAP)} className="block" onMouseLeave={() => k.setActive(null)}>
            {cols.map((c, j) =>
              j % every === 0 ? (
                <text key={c} x={LABEL + j * (size + GAP) + size / 2} y={HEAD - 4} textAnchor="middle" className="fill-faint text-tiny">
                  {c}
                </text>
              ) : null,
            )}
            {rows.map((r, i) => (
              <text key={r} x={0} y={HEAD + i * (size + GAP) + size / 2} dominantBaseline="middle" className="fill-dim text-tiny">
                {r}
              </text>
            ))}
            {rows.flatMap((_, i) =>
              cols.map((_, j) => {
                const n = i * cols.length + j;
                const c = at.get(n);
                const ramp = !c?.tone && c?.value != null;
                return (
                  <rect
                    key={n}
                    x={LABEL + j * (size + GAP)}
                    y={HEAD + i * (size + GAP)}
                    width={size}
                    height={size}
                    rx={2}
                    onClick={c && onCell ? () => onCell(c) : undefined}
                    onMouseEnter={() => k.setActive(n)}
                    className={cx(
                      c?.tone ? SVG[c.tone] : !ramp && 'fill-panel stroke-line',
                      k.active === n && 'stroke-ink',
                      c && onCell && 'cursor-pointer',
                    )}
                    strokeWidth={k.active === n ? 2 : 1}
                    style={ramp ? { fill: `color-mix(in srgb, var(--chart-1) ${max > 0 ? Math.round((c.value! / max) * 100) : 0}%, var(--sunk))` } : undefined}
                  >
                    <title>{word(n)}</title>
                  </rect>
                );
              }),
            )}
          </svg>
        )}
      </div>
    </Frame>
  );
}
