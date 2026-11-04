// The view's store reads and its clock.
import { useEffect, useState } from 'react';
import { MODEL, useParts } from '../../app/store';
import type { State } from '../../live/reducers';
import { chainOf } from '../../model';
import { SS } from '../../model/base';
import { pick } from './data';

// The state: a terminal line or a history delta repaints the view only when it is the shown session's.
const parts = (s: State) => {
  const x = pick(s);
  return [...MODEL(s), s.history, s.usage, ...(x ? [s.tails[x.key], ...chainOf(x, SS(s)).map((y) => s.live.changed[`history:${y.key}`])] : [])];
};
export const useAll = () => useParts(parts);

// Epoch seconds, again every step ms, so a live countdown and the timeline grow on the client.
export function useNow(step = 1000) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), step);
    return () => clearInterval(t);
  }, [step]);
  return now;
}
