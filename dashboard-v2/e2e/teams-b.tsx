// The e2e harness of the Routines and Memory tabs on the Vite dev server, until the team page frame mounts them.
// The route comes from the hash as the shell parses it; the reads go to /api, which the spec answers.
import { createRoot } from 'react-dom/client';
import { pollSnapshot } from '../src/live/poll';
import type { J } from '../src/model/base';
import { parse } from '../src/router';
import { dispatch, store, useApp } from '../src/store';
import '../src/styles/theme.css';
import '../src/app/shell.css';
import { MemoryTab } from '../src/views/teams/memory';
import { RoutinesTab } from '../src/views/teams/routines';

const sync = () => store.setState({ route: parse(location.hash, store.getState().route) });
addEventListener('hashchange', sync);
sync();
// The spec sends stream events (a routine-hist read after a delta) through this.
(window as { __dispatch?: typeof dispatch }).__dispatch = dispatch;
void pollSnapshot({ dispatch, getState: store.getState, tails: () => [] });

function Harness() {
  const route = useApp((s) => s.route);
  const team = useApp((s) => ((s.feeds.teams?.data as J[] | null) ?? []).find((t) => t.profile === route.sel));
  if (!team) return <p>loading teams…</p>;
  return (
    <main className="main" style={{ height: '100vh', padding: 24 }}>
      <h1 id="team-h">{team.label}</h1>
      {route.tab === 'memory' ? <MemoryTab team={team} /> : <RoutinesTab team={team} />}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Harness />);
