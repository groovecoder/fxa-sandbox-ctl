// Visx loads in its own chunk on the first Sankey, so a view without one does not load it.
import { lazy, Suspense } from 'react';
import type { SankeyProps } from './index';

const Layout = lazy(() => import('./sankey').then((m) => ({ default: m.Sankey })));

export function Sankey(p: SankeyProps) {
  return (
    // No chart role in the fallback: a key press on it would go nowhere.
    <Suspense fallback={<p className="empty">loading…</p>}>
      <Layout {...p} />
    </Suspense>
  );
}
