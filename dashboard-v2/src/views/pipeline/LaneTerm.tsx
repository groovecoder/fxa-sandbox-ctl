// The pipeline terminal window (#lane/<KEY>): one run's live output, with no shell around it.
import { useEffect } from 'react';
import { Terminal, type TerminalState } from '../../charts';
import { beltGroups } from '../../model';
import { LANE_ST, type J } from '../../model/base';
import { SNAP, laneTitle } from '../../model/pipeline';
import { useApp } from '../../store';
import { EmptyBox } from '../../ui';
import { useTail } from '../shared/tails';
import '../sessions/sessions.css';

const TTY: Record<string, TerminalState> = { running: 'running', waiting: 'waiting on you', error: 'output unavailable', connecting: 'connecting…' };
const NO_LINES: string[] = [];

export default function LaneTerm({ laneKey }: { laneKey: string }) {
  const s = useApp((st) => st), r: J | undefined = SNAP(s) ? (beltGroups(s) as J).working.find((x: J) => x.t.key === laneKey) : undefined;
  useTail(laneKey);
  useEffect(() => { document.title = `${laneKey} terminal`; }, [laneKey]);
  const tail = s.tails[laneKey], t = r?.t;
  const state: TerminalState = tail?.lines.length ? TTY[tail.state] ?? 'running' : tail?.state === 'error' ? 'output unavailable' : 'connecting…';
  return (
    <main className="termpage">
      <header className="termbar">
        <span className="key">{laneKey}</span>
        <h1 title={t?.summary || undefined}>{t ? laneTitle(t.summary || t.branch).text || laneKey : ''}</h1>
        <span className="sxm">{!SNAP(s) ? 'loading…' : r ? `${LANE_ST[r.st]} · ${Math.round((t.elapsed_seconds ?? 0) / 60)} min` : 'not running now'}</span>
      </header>
      {SNAP(s) || tail?.lines.length ? (
        <div className="ttyw">
          <Terminal title={`agent@sandbox: ${t?.name || laneKey.toLowerCase()}`} lines={tail?.lines ?? NO_LINES} state={state} />
        </div>
      ) : <EmptyBox>{`Loading ${laneKey}…`}</EmptyBox>}
    </main>
  );
}
