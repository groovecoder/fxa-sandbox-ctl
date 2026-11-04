// The shell's view of the C2 store: the Zustand StoreApi shape of the W1-DATA store.
import { createContext, useContext, useRef, useSyncExternalStore } from 'react';
import * as model from '../model';
import { pipe } from '../model/pipeline';
import type { Alert, Badge, BeltGroups, Health, Needs, Snapshot, SkippedTicket, StatsRow } from '../model';
import { store } from '../store';
import { savePref } from '../store/prefs';
import type { Session, Store } from '../store/types';

export type StoreApi<T> = {
  getState: () => T;
  setState: (patch: Partial<T> | ((s: T) => Partial<T>)) => void;
  subscribe: (fn: () => void) => () => void;
};

export { savePref };

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

export const StoreCtx = createContext<StoreApi<Store>>(store);
export const SelCtx = createContext<Sel>(modelSel);

export const useStore = () => useContext(StoreCtx);
export const useSel = () => useContext(SelCtx);

// What the src/model selectors read: not the errors feed, the stream clock, the terminals or the flow.
export const MODEL = (s: Store): unknown[] => [pipe(s), s.feeds.agents, s.feeds.stats, s.feeds.teams, s.feeds.overview, s.sessions, s.viewer, s.prefs, s.route, s.conn.mode];

// The state for a view that hands all of it to the model: it repaints only when one of parts(s) changes,
// and until then it keeps the state of that change, so a ping or a terminal line elsewhere does not repaint it.
export function useParts<T extends Store = Store>(parts: (s: T) => unknown[]): T {
  const st = useStore(), last = useRef<{ d: unknown[]; s: T } | null>(null);
  return useSyncExternalStore(st.subscribe, () => {
    const s = st.getState() as T, d = parts(s), l = last.current;
    if (l && l.d.length === d.length && l.d.every((x, i) => x === d[i])) return l.s;
    last.current = { d, s };
    return s;
  });
}

// A selector that throws (a stub, or a bad feed row) gives null, not a crash of the shell.
export const safe = <T,>(f: () => T): T | null => {
  try {
    return f();
  } catch {
    return null;
  }
};
