// Visx loads in its own chunk on the first Sankey, so a view without one does not load it.
import { lazy, Suspense } from 'react';
import { ChartFrame } from './frame';
import type { SankeyProps } from './index';

const Layout = lazy(() => import('./sankey').then((m) => ({ default: m.Sankey })));

export function Sankey(p: SankeyProps) {
  return (
    <Suspense fallback={<ChartFrame title={p.title} summary={p.summary} table={p.table}><p className="empty">loading…</p></ChartFrame>}>
      <Layout {...p} />
    </Suspense>
  );
}
