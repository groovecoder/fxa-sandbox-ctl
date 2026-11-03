// The Routines tab of the team page; W2-TEAMS-B replaces this placeholder. The team page passes the team's feed row.
import type { J } from '../../../model/base';
import { EmptyBox } from '../../../ui';

export default function RoutinesTab({ team }: { team: J }) {
  return <EmptyBox>The routines of {team.label || team.profile} are not built yet.</EmptyBox>;
}
