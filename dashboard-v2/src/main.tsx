import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { createStore, fixedSel, initialStore, modelSel, type FixedSel } from './app/store';
import type { Store } from './store/types';
import './styles/theme.css';

// The e2e sets a hand-made store and fixed selector results here, before the page loads.
const fx = (window as { __V2_FIXTURE__?: { store: Omit<Store, 'prefs' | 'route'>; sel: FixedSel } }).__V2_FIXTURE__;
const base = initialStore();
const store = createStore<Store>(fx ? { ...base, ...fx.store, prefs: base.prefs, route: base.route } : base);
if (fx) (window as { __V2_STORE__?: typeof store }).__V2_STORE__ = store;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App store={store} sel={fx ? fixedSel(fx.sel) : modelSel} />
  </StrictMode>,
);
