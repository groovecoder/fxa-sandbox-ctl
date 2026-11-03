import { Shell } from './Shell';
import { SelCtx, StoreCtx, type Sel, type StoreApi } from './store';
import type { Store } from '../store/types';

export function App({ store, sel, poll }: { store: StoreApi<Store>; sel: Sel; poll?: () => Promise<void> }) {
  return (
    <StoreCtx.Provider value={store}>
      <SelCtx.Provider value={sel}>
        <Shell poll={poll} />
      </SelCtx.Provider>
    </StoreCtx.Provider>
  );
}
