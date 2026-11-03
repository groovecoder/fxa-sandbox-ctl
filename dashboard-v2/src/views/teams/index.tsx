// The Teams view's chunk: All teams, New team or a team page in main, and the team list at the side.
import { useEffect } from 'react';
import type { ViewChunk } from '../../app/views';
import { TEAMS } from '../../model/base';
import { useApp } from '../../store';
import { EmptyBox } from '../../ui';
import { AllTeams } from './AllTeams';
import { teamSide } from './lib';
import { NewTeam } from './NewTeam';
import { onTeam, useTs } from './state';
import { TeamPage } from './TeamPage';
import './teams.css';

function Main() {
  const sel = useApp((s) => s.route.sel), tab = useApp((s) => s.route.tab);
  // As v1: the teams are in after the server's first profile read, which gives the age.
  const T = useApp(TEAMS), ready = T?.age_seconds != null;
  useEffect(() => onTeam(sel), [sel]);
  // After a navigation the focus goes to the team heading, unless Test and activate takes it.
  useEffect(() => {
    if (!sel || !ready || useTs.getState().tact === sel) return;
    document.getElementById('team-h')?.focus({ preventScroll: !matchMedia('(max-width:900px)').matches });
  }, [sel, tab, ready]);
  if (!ready) return <EmptyBox>{T?.error || 'loading teams… the first profile list can take a minute'}</EmptyBox>;
  return sel === '' ? <AllTeams /> : sel === 'new' ? <NewTeam /> : <TeamPage p={sel} tab={tab} />;
}

const chunk: ViewChunk = { Main, side: teamSide };
export default chunk;
