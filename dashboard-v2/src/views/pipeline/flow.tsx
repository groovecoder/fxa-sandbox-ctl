// The flow beside the belts: how many tickets are at each phase now.
import { BarList, ChartFrame } from '../../charts';
import type { J } from '../../model/base';
import { Card } from '../../ui';
import { flowGraph } from './data';

export function Flow({ g, snap, done }: { g: J; snap: J; done: J[] }) {
  const f = flowGraph(g, snap, done);
  const name = Object.fromEntries(f.nodes.map((n) => [n.id, n.label]));
  const table = { head: ['From', 'To', 'Tickets'], rows: f.links.map((l) => [name[l.source]!, name[l.target]!, l.value]) };
  const funnel = [
    { name: 'Queue', value: f.n.ready + f.n.held + f.n.skipped }, { name: 'Agent run', value: f.n.run },
    { name: 'PR', value: f.n.pr }, { name: 'Merged, 7 days', value: f.n.merged }, { name: 'Closed', value: f.n.closed },
  ];
  return (
    <Card flat sm className="pflow">
      <ChartFrame title="Pipeline now" summary={f.summary} table={table}>
        <BarList label="Tickets at each phase now" items={funnel} />
      </ChartFrame>
      <p className="pnote">Queue: {f.n.ready} ready, {f.n.held} held by another ticket, {f.n.skipped} need a decision.</p>
    </Card>
  );
}
