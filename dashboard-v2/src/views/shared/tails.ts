// The tail subscriptions: each shown terminal names its key, and the stream reads only those (POST /api/live/tails).
import { useEffect } from 'react';
import { showTails } from '../../store';

const shown = new Map<string, number>();
const send = () => showTails([...shown.keys()]);

// A count per key: two terminals of one key keep it until both unmount.
export function useTail(key: string | null | undefined) {
  useEffect(() => {
    if (!key) return;
    shown.set(key, (shown.get(key) ?? 0) + 1);
    send();
    return () => {
      const n = (shown.get(key) ?? 1) - 1;
      if (n > 0) shown.set(key, n);
      else shown.delete(key);
      send();
    };
  }, [key]);
}
