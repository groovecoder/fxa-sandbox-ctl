// The view's store reads and its clock.
import { useEffect, useState } from 'react';
import type { State } from '../../live/reducers';
import { useApp } from '../../store';

const all = (s: State) => s;
// The whole state: the shell repaints on each change, so the view reads the same snapshot as its side list and details.
export const useAll = () => useApp(all);

// Epoch seconds, again every step ms, so a live countdown and the timeline grow on the client.
export function useNow(step = 1000) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), step);
    return () => clearInterval(t);
  }, [step]);
  return now;
}
