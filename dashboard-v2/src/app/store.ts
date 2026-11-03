// The shell's view of the C2 store: the Zustand StoreApi shape, so the W1-DATA store plugs in as it is.
import { createContext, useContext, useSyncExternalStore } from 'react';
import * as model from '../model';
import type { Alert, Badge, BeltGroups, Health, Needs, Snapshot, SkippedTicket, StatsRow } from '../model';
import { initial } from '../live/reducers';
import { HOME } from '../router';
import { loadPrefs, savePref } from '../store/prefs';
import type { Session, Store } from '../store/types';

export type StoreApi<T> = {
  getState: () => T;
  setState: (patch: Partial<T> | ((s: T) => Partial<T>)) => void;
  subscribe: (fn: () => void) => () => void;
};

export function createStore<T>(init: T): StoreApi<T> {
  let state = init;
  const subs = new Set<() => void>();
  return {
    getState: () => state,
    setState: (p) => {
      state = { ...state, ...(typeof p === 'function' ? p(state) : p) };
      subs.forEach((f) => f());
    },
    subscribe: (f) => (subs.add(f), () => subs.delete(f)),
  };
}

export { savePref };

// One initial store for the shell and the live data: the W1-DATA copy, at the shell's home route.
export const initialStore = (): Store => ({ ...initial(loadPrefs()), route: HOME });

// A side list item: d is the dot tone, find the text that the search matches (default t and m).
export type SideItem = { id: string; d: string; t: string; m: string[]; tip?: string; find?: string };
export type SideGroup = { group?: string; items: SideItem[] };

// The selectors the shell reads. The default is src/model; the e2e passes fixed values.
export type Sel = Pick<
  typeof model,
  | 'alerts' | 'health' | 'ovNeeds' | 'sbBadge' | 'teamBadge' | 'beltGroups' | 'beltCount' | 'isWaitingOnHuman'
  | 'sessHeads' | 'answerRows' | 'queueWaits' | 'pipeSnap'
> & {
  // The list of the current view; null while it loads. The views add theirs in wave 2.
  side: (s: Store) => SideGroup[] | null;
};

export const SIDE: Partial<Record<string, (s: Store) => SideGroup[] | null>> = {};
export const modelSel: Sel = { ...model, side: (s) => SIDE[s.route.view]?.(s) ?? null };

// Fixed selector results, for the shell tests on a hand-made store.
export type FixedSel = {
  alerts: Alert[];
  health: Health;
  ovNeeds: Needs;
  sbBadge: Badge;
  teamBadge: '' | 'warn' | 'bad';
  beltGroups: BeltGroups;
  beltCount: number | null;
  waiting: string[];
  heads: string[];
  answerRows: StatsRow[];
  queueWaits: SkippedTicket[];
  pipeSnap: Snapshot | null;
  side: Record<string, SideGroup[] | null>;
};

export const fixedSel = (f: FixedSel): Sel => ({
  alerts: () => f.alerts,
  health: () => f.health,
  ovNeeds: () => f.ovNeeds,
  sbBadge: () => f.sbBadge,
  teamBadge: () => f.teamBadge,
  beltGroups: () => f.beltGroups,
  beltCount: () => f.beltCount,
  isWaitingOnHuman: (r) => f.waiting.includes(String(r.key)),
  sessHeads: (ss: Session[]) => ss.filter((s) => f.heads.includes(s.key)),
  answerRows: () => f.answerRows,
  queueWaits: () => f.queueWaits,
  pipeSnap: () => f.pipeSnap,
  side: (s) => f.side[s.route.view] ?? null,
});

export const StoreCtx = createContext<StoreApi<Store>>(createStore(initialStore()));
export const SelCtx = createContext<Sel>(modelSel);

export const useStore = () => useContext(StoreCtx);
export const useStoreState = () => {
  const st = useStore();
  return useSyncExternalStore(st.subscribe, st.getState);
};
export const useSel = () => useContext(SelCtx);

// A selector that throws (a stub, or a bad feed row) gives null, not a crash of the shell.
export const safe = <T,>(f: () => T): T | null => {
  try {
    return f();
  } catch {
    return null;
  }
};
