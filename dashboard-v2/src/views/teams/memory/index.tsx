// The Memory tab of the team page; W2-TEAMS-B replaces this placeholder. The team page passes the team's feed row.
import type { J } from '../../../model/base';
import { EmptyBox } from '../../../ui';

export default function MemoryTab({ team }: { team: J }) {
  return <EmptyBox>The memory of {team.label || team.profile} is not built yet.</EmptyBox>;
}
