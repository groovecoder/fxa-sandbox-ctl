// The pipeline flow: the Visx Sankey layout, drawn in the chart tokens.
import { Sankey as Layout } from '@visx/sankey';
import { Frame, NoData, useChartKeys, useWidth } from './frame';
import type { SankeyNode as Node, SankeyProps } from './index';

const HEIGHT = 220;
const PAD = 4;

export function Sankey({ title, summary, table, nodes, links, onNode }: SankeyProps) {
  const [ref, width] = useWidth();
  const k = useChartKeys(nodes.length, (i) => {
    const id = nodes[i]?.id;
    if (id != null) onNode?.(id);
  });
  const ids = new Set(nodes.map((n) => n.id));
  // d3-sankey writes its layout into the objects it gets, and throws on a link to a missing node.
  const root = {
    nodes: nodes.map((n) => ({ ...n })),
    links: links.filter((l) => ids.has(l.source) && ids.has(l.target) && l.value > 0).map((l) => ({ ...l })),
  };
  const active = k.active == null ? null : nodes[k.active]!.id;
  const flow = (id: string) => {
    const into = root.links.filter((l) => l.target === id).reduce((s, l) => s + l.value, 0);
    const out = root.links.filter((l) => l.source === id).reduce((s, l) => s + l.value, 0);
    return Math.max(into, out);
  };
  const tip = active == null ? null : `${nodes[k.active!]!.label}: ${flow(active)}`;
  return (
    <Frame title={title} summary={summary} table={table} keys={k.keys} tip={tip}>
      <div ref={ref}>
        {root.links.length === 0 ? (
          <NoData />
        ) : (
          <svg width={width} height={HEIGHT} className="block">
            <Layout<Node, object>
              root={root}
              nodeId={(n) => n.id}
              size={[width - 2 * PAD, HEIGHT - 2 * PAD]}
              nodeWidth={10}
              nodePadding={14}
            >
              {({ graph, createPath }) => (
                <g transform={`translate(${PAD},${PAD})`}>
                  {graph.links.map((l, i) => (
                    <path
                      key={i}
                      d={createPath(l) ?? ''}
                      fill="none"
                      className="stroke-chart-muted"
                      strokeOpacity={0.35}
                      strokeWidth={Math.max(1, l.width ?? 0)}
                    />
                  ))}
                  {graph.nodes.map((n, i) => {
                    const left = (n.x0 ?? 0) < width / 2;
                    const y = ((n.y0 ?? 0) + (n.y1 ?? 0)) / 2;
                    return (
                      <g
                        key={n.id}
                        onClick={() => onNode?.(n.id)}
                        onMouseEnter={() => k.setActive(i)}
                        className={onNode ? 'cursor-pointer' : undefined}
                      >
                        <rect
                          x={n.x0}
                          y={n.y0}
                          width={(n.x1 ?? 0) - (n.x0 ?? 0)}
                          height={Math.max(1, (n.y1 ?? 0) - (n.y0 ?? 0))}
                          className={active === n.id ? 'fill-ink' : 'fill-chart-1'}
                        />
                        <text
                          x={left ? (n.x1 ?? 0) + 6 : (n.x0 ?? 0) - 6}
                          y={y}
                          dominantBaseline="middle"
                          textAnchor={left ? 'start' : 'end'}
                          className="fill-ink text-tiny"
                        >
                          {n.label} {n.value}
                        </text>
                      </g>
                    );
                  })}
                </g>
              )}
            </Layout>
          </svg>
        )}
      </div>
    </Frame>
  );
}
