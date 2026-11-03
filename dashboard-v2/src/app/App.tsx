import { useEffect, useState } from 'react';
import { viewOf } from './views';

// A placeholder until W1-SHELL adds the router and the shell: it names the view of the hash.
export function App() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  const view = viewOf(hash.slice(1).split(/[/?]/)[0] ?? '');
  return (
    <main>
      <h1>{view.title}</h1>
      <p>{view.sub}</p>
      <p>This view is not built yet.</p>
    </main>
  );
}
