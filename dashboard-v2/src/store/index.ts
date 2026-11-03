// useApp compares shallowly, so a delta repaints only what it changes.
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { createStore } from 'zustand/vanilla';
import { getJson, latest } from '../live/api';
import { type Action, type State, apply, initial } from '../live/reducers';
import { type Live, startLive } from '../live/sse';
import type { Route } from '../router/types';
import { loadPrefs, savePref } from './prefs';
import type { Prefs } from './types';

export const store = createStore<State>(() => initial(loadPrefs()));
export const dispatch = (a: Action) => store.setState((s) => apply(s, a), true);
export const useApp = <T>(sel: (s: State) => T): T => useStore(store, useShallow(sel));

export const setRoute = (route: Route) => store.setState({ route });
export function setPref<K extends keyof Prefs>(k: K, v: Prefs[K]) {
  savePref(k, v);
  store.setState((s) => ({ prefs: { ...s.prefs, [k]: v } }));
}

let live: Live | null = null;
// Opens the stream once per tab; showTails names the terminals on screen.
export const connect = (): Live => (live ??= startLive({ dispatch, getState: store.getState }));
// The terminals on screen; a no-op when no stream runs (the e2e fixture store).
export const showTails = (keys: string[]) => live?.showTails(keys);

// The reads that a view starts when it shows an item. Only the last answer per key counts.
const enc = encodeURIComponent;
export async function readHistory(key: string) {
  const g = await latest<Record<string, unknown>[]>(`history:${key}`, `/api/history?key=${enc(key)}`);
  if (g) dispatch({ event: 'history', data: 'data' in g ? { key, rows: Array.isArray(g.data) ? g.data : [] } : { key, error: 'could not load the conversation' } });
}
export async function readUsage(key: string) {
  const g = await latest<{ models?: Record<string, unknown>[] }>(`usage:${key}`, `/api/usage?run=${enc(key)}`);
  if (g) dispatch({ event: 'usage', data: 'data' in g ? { key, models: g.data.models ?? [] } : { key, error: g.error } });
}
export async function readRoutines(team: string) {
  const g = await latest<Record<string, unknown>>(`routines:${team}`, `/api/teams/${enc(team)}/routines`);
  if (g && 'data' in g) dispatch({ event: 'routines', data: { team, list: g.data } });
  return g;
}
export async function readRoutineHist(team: string, id: string) {
  const g = await latest<Record<string, unknown>[]>(`rthist:${id}`, `/api/teams/${enc(team)}/routines/${enc(id)}/history`);
  if (g && 'data' in g && Array.isArray(g.data)) dispatch({ event: 'routine-hist', data: { id, runs: g.data } });
  return g;
}
export async function readMemory(team: string) {
  const g = await getJson<Record<string, unknown>>(`/api/teams/${enc(team)}/memory`);
  if ('data' in g) dispatch({ event: 'memory', data: { team, memory: g.data } });
  return g;
}
