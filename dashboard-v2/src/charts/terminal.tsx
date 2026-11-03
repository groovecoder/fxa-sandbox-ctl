// The terminal from v1 (.tty): append-only lines in a 200-line window, ttyLine colours, a log that reads aloud on request.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '../ui/tone';
import type { TerminalProps } from './index';

const WINDOW = 200;
// Within this many px of the bottom, a new line scrolls the screen down; further up, the reader keeps the place.
const STICK = 24;

/** The v1 ttyLine rules: a tool call, a test result, an option or a status line. */
export function ttyLine(l: string): ReactNode {
  const m = /^\[tool\] (\S+)\s*(.*)$/.exec(l);
  if (m)
    return m[1] === 'Bash' || m[1] === 'shell' ? (
      <>
        <span className="font-bold text-tty-prompt">$</span> {m[2]}
      </>
    ) : (
      <>
        <span className="font-bold text-tty-tool">{m[1]}</span> {m[2]}
      </>
    );
  // Only real results get a colour; prose that names "failed" stays plain.
  if (/^\s*(FAIL\b|ERROR\b|Error:|✗|✕|Tests:.*\bfailed\b)/.test(l)) return <span className="text-tty-bad">{l}</span>;
  if (/^\s*(PASS\b|✓|Tests:.*\bpassed\b)/.test(l)) return <span className="text-tty-prompt">{l}</span>;
  if (/^OPTION:/.test(l)) return <span className="text-tty-opt">{l}</span>;
  // tty-dim, not the v1 tty-muted: tty-muted on tty-bg is below the 4.5:1 contrast for text.
  if (/^status:/.test(l)) return <span className="text-tty-dim">{l}</span>;
  return l;
}

export function Terminal({ title, lines, state }: TerminalProps) {
  const [aloud, setAloud] = useState(false);
  const screen = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const first = Math.max(0, lines.length - WINDOW);
  const busy = state === 'running';
  useLayoutEffect(() => {
    const el = screen.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lines.length]);
  const onScroll = () => {
    const el = screen.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK;
  };
  return (
    <section aria-label={title} className="flex h-full flex-col overflow-hidden rounded-md border border-tty-line bg-tty-bg text-tty-ink">
      <div className="flex items-center gap-s2 border-b border-tty-line bg-tty-bar px-s3 py-s2 font-mono text-label text-tty-dim">
        <i aria-hidden className="size-s3 rounded-pill bg-tty-dot-1" />
        <i aria-hidden className="size-s3 rounded-pill bg-tty-dot-2" />
        <i aria-hidden className="size-s3 rounded-pill bg-tty-dot-3" />
        <span className="ml-s2 min-w-0 flex-1 truncate">{title}</span>
        <span className={busy ? 'text-tty-prompt' : 'text-tty-dim'}>{state}</span>
        <button
          type="button"
          aria-pressed={aloud}
          onClick={() => setAloud(!aloud)}
          className="rounded-sm border border-tty-line bg-transparent px-s2 font-mono text-label text-tty-dim aria-pressed:text-tty-prompt"
        >
          Read new lines aloud
        </button>
      </div>
      <div
        ref={screen}
        onScroll={onScroll}
        role="log"
        aria-live={aloud ? 'polite' : 'off'}
        aria-label={`${title} output`}
        tabIndex={0}
        className="ds-screen min-h-0 flex-1 overflow-auto overscroll-contain px-s3 py-s3 font-mono text-label leading-relaxed break-words whitespace-pre-wrap"
      >
        {lines.length === 0 ? (
          <div className="text-tty-dim">waiting for output…</div>
        ) : (
          lines.slice(first).map((l, i) => <div key={first + i}>{ttyLine(l)}</div>)
        )}
        <span aria-hidden className={cx('inline-block h-s3 w-s2 bg-tty-ink', busy ? 'ds-blink' : 'opacity-25')} />
      </div>
    </section>
  );
}
