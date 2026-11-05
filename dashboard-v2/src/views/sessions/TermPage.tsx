// The terminal window (#term/<key>): the session's live output and state, with no shell around it.
import { useEffect } from 'react';
import { Terminal, type TerminalState } from '../../charts';
import { short } from '../../format';
import { SS } from '../../model/base';
import { convTitle, fixGated, sessStatus } from '../../model/sessions';
import { useApp } from '../../store';
import { Dot, EmptyBox } from '../../ui';
import { useTail } from '../shared/tails';
import { TONE_OF, isLive, pauseIn } from './data';
import { useNow } from './hooks';
import './sessions.css';

const NO_LINES: string[] = [];

export default function TermPage({ sessKey }: { sessKey: string }) {
  const s = useApp((st) => st), now = useNow(), x = SS(s).find((y) => y.key === sessKey), gated = !!x && fixGated(s, x);
  useTail(x && !gated ? sessKey : null);
  const title = x && !gated ? convTitle(s, x) : '';
  useEffect(() => { document.title = `${sessKey} terminal`; }, [sessKey]);
  if (!x || gated) return <main className="termpage"><EmptyBox>{gated ? 'Only a team admin can see this terminal.' : `Loading ${sessKey}…`}</EmptyBox></main>;
  const [st, tone] = sessStatus(x), t = s.tails[sessKey], p = pauseIn(s, x, now);
  const state: TerminalState = t?.state === 'error' ? 'output unavailable' : x.agent_alive ? 'running' : t?.lines.length ? 'waiting on you' : 'connecting…';
  return (
    <main className="termpage">
      <header className="termbar">
        <span className="key">{x.key}</span>
        <h1 title={title}>{title}</h1>
        <Dot tone={TONE_OF[tone]} label={st} live={tone === 'info' && isLive(x)} />
        <span className="sxm">{st}{p != null && p < 600 ? ` · pauses in ${short(p)}` : ''}</span>
      </header>
      <div className="ttyw">
        <Terminal title={`agent@sandbox: ${x.key}`} lines={t?.lines ?? NO_LINES} state={state} />
      </div>
    </main>
  );
}
