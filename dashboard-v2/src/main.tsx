import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { fixedSel, modelSel, type FixedSel } from './app/store';
import { pollSnapshot } from './live/poll';
import { connect, dispatch, store } from './store';
import type { Store } from './store/types';
import './styles/theme.css';

// The #__ds example page exists only in the dev build: the build drops this branch and the page's chunk.
const DsPage = import.meta.env.DEV && location.hash === '#__ds' ? lazy(() => import('./ui/DsPage')) : null;
// The Terminal button of a live session opens #term/<key> in its own window.
const termKey = /^#term\/(agent-[a-z0-9]{4,12})$/.exec(location.hash)?.[1];
const TermPage = termKey ? lazy(() => import('./views/sessions/TermPage')) : null;

// The e2e sets a hand-made store and fixed selector results here, before the page loads. Then no stream opens.
const fx = (window as { __V2_FIXTURE__?: { store: Omit<Store, 'prefs' | 'route'>; sel: FixedSel } }).__V2_FIXTURE__;
if (fx) {
  store.setState(fx.store);
  (window as { __V2_STORE__?: typeof store }).__V2_STORE__ = store;
} else if (!DsPage) connect();

// The Refresh button reads the snapshot again while the stream is down.
const poll = () => pollSnapshot({ dispatch, getState: store.getState, tails: () => [] });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {DsPage ? (
      <Suspense>
        <DsPage />
      </Suspense>
    ) : TermPage ? (
      <Suspense>
        <TermPage sessKey={termKey!} />
      </Suspense>
    ) : (
      <App store={store} sel={fx ? fixedSel(fx.sel) : modelSel} poll={fx ? undefined : poll} />
    )}
  </StrictMode>,
);
