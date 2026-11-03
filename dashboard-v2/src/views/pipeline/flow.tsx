// The flow panel under the belts: the pipeline Sankey (a funnel below 640 px) and the cumulative flow from the flow events.
import { scaleLinear } from 'd3-scale';
import { useEffect, useState } from 'react';
import { BarList, ChartFrame, Sankey } from '../../charts';
import { Frame, NoData, timeLabel, useChartKeys, useWidth } from '../../charts/frame';
import { LANE_ST, type J } from '../../model/base';
import type { FlowPoint } from '../../store/types';
import { Card } from '../../ui';
import { flowGraph, stackFlow } from './data';

const useMedia = (q: string) => {
  const [m, setM] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const l = matchMedia(q), on = () => setM(l.matches);
    l.addEventListener('change', on);
    return () => l.removeEventListener('change', on);
  }, [q]);
  return m;
};

export function Flow({ g, snap, done, points, onStops }: { g: J; snap: J; done: J[]; points: FlowPoint[]; onStops: (id: string) => void }) {
  const narrow = useMedia('(max-width: 640px)');
  const f = flowGraph(g, snap, done);
  const name = Object.fromEntries(f.nodes.map((n) => [n.id, n.label]));
  const table = { head: ['From', 'To', 'Tickets'], rows: f.links.map((l) => [name[l.source]!, name[l.target]!, l.value]) };
  const funnel = [
    { name: 'Queue', value: f.n.ready + f.n.held + f.n.skipped }, { name: 'Agent run', value: f.n.run },
    { name: 'PR', value: f.n.pr }, { name: 'Merged, 7 days', value: f.n.merged }, { name: 'Closed', value: f.n.closed },
  ];
  return (
    <section className="pflow" aria-labelledby="pflow-h">
      <h2 className="bgh" id="pflow-h">Pipeline flow</h2>
      <div className="pflow-grid">
        <Card flat sm>
          {narrow ? (
            <ChartFrame title="Pipeline now" summary={f.summary} table={table}>
              <BarList label="Tickets at each phase now" items={funnel} />
            </ChartFrame>
          ) : (
            <>
              <Sankey title="Pipeline now" summary={f.summary} table={table} nodes={f.nodes} links={f.links} onNode={onStops} />
              <p className="pnote">A link carries the tickets that got past it. Pick a node to show its stops on the belts.</p>
            </>
          )}
        </Card>
        <Card flat sm>
          <CumFlow points={points} />
        </Card>
      </div>
    </section>
  );
}

const H = 180, AXIS = 18, LEFT = 28;
const BAND = ['fill-chart-muted', 'fill-chart-1', 'fill-chart-1', 'fill-chart-1', 'fill-chart-1', 'fill-chart-2', 'fill-chart-2', 'fill-chart-2', 'fill-chart-3'];
// Stops of one phase share a colour; the opacity steps tell them apart, and each band has its name.
const SHADE = [0.5, 1, 0.8, 0.6, 0.4, 1, 0.7, 0.45, 0.8];

export function CumFlow({ points }: { points: FlowPoint[] }) {
  const [ref, width] = useWidth();
  const k = useChartKeys(points.length);
  const st = stackFlow(points), first = points[0], last = points[points.length - 1];
  const span = first && last ? last.at - first.at : 0;
  const since = span < 86400 - 120 ? 'Since the server started' : 'Last 24 h';
  const now = last ? LANE_ST.map((s, i) => `${s} ${last.stops[i] ?? 0}`).join(', ') : '';
  const summary = last ? `Tickets at each stop over time. ${since}, ${points.length} minutes. Now: ${now}.` : 'Tickets at each stop over time: no flow point yet.';
  // One table row each 15 minutes and the last one: the full minute list is 1,440 rows.
  const rows = points.filter((_, i) => i % 15 === 0 || i === points.length - 1).map((p) => [timeLabel(p.at, span), ...LANE_ST.map((_, i) => p.stops[i] ?? 0)]);
  const x = scaleLinear().domain([first?.at ?? 0, last?.at ?? 1]).range([LEFT, Math.max(LEFT + 1, width - 4)]);
  const y = scaleLinear().domain([0, Math.max(1, ...st.map((p) => p.tops[8] ?? 0))]).nice().range([H - AXIS, 4]);
  const band = (i: number) => {
    const top = st.map((p) => `${x(p.at)},${y(p.tops[i] ?? 0)}`), bot = st.map((p) => `${x(p.at)},${y(i ? p.tops[i - 1] ?? 0 : 0)}`).reverse();
    return `M${top.join('L')}L${bot.join('L')}Z`;
  };
  const a = k.active == null ? null : points[k.active]!;
  const tip = a && `${timeLabel(a.at, span)}: ${LANE_ST.map((s, i) => `${s} ${a.stops[i] ?? 0}`).join(', ')}`;
  return (
    <Frame title="Cumulative flow" summary={summary} table={{ head: ['Time', ...LANE_ST], rows }} keys={k.keys} tip={tip}
      note={`${since}. One band per stop, Queue at the bottom; the table has one row each 15 min.`}>
      <div ref={ref}>
        {points.length < 2 ? (
          <NoData>Not enough flow history yet.</NoData>
        ) : (
          <svg width={width} height={H} className="block" onMouseLeave={() => k.setActive(null)}
            onMouseMove={(e) => {
              const px = e.clientX - e.currentTarget.getBoundingClientRect().left, t = x.invert(px);
              let best = 0;
              points.forEach((p, i) => { if (Math.abs(p.at - t) < Math.abs(points[best]!.at - t)) best = i; });
              k.setActive(best);
            }}>
            {LANE_ST.map((s, i) => (
              <path key={s} d={band(i)} className={BAND[i]} fillOpacity={SHADE[i]}><title>{s}</title></path>
            ))}
            {a && <line x1={x(a.at)} x2={x(a.at)} y1={4} y2={H - AXIS} className="stroke-ink" />}
            <text x={0} y={y(y.domain()[1]!) + 8} className="fill-faint text-tiny">{y.domain()[1]}</text>
            <text x={0} y={H - AXIS} className="fill-faint text-tiny">0</text>
            {x.ticks(Math.max(2, Math.floor(width / 120))).map((t) => (
              <text key={t} x={x(t)} y={H - 4} textAnchor="middle" className="fill-faint text-tiny">{timeLabel(t, span)}</text>
            ))}
          </svg>
        )}
      </div>
    </Frame>
  );
}
