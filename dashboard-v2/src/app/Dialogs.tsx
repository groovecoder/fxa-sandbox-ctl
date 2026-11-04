// The help dialog and the command palette. A native modal dialog traps the focus and makes the page inert.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BELT_KEY_RE, format, HOME, SESSION_RE, sessTabOf, TEAM_RE, viewHash } from '../router';
import type { Store } from '../store/types';
import { errorsOf, sessionList, snapOf, teamsOf } from './derive';
import { VIEWS } from './views';

type Row = Record<string, unknown>;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
// Tab wraps inside box, so the focus never leaves it.
export function wrapTab(e: { key: string; shiftKey: boolean; preventDefault: () => void }, box: HTMLElement) {
  if (e.key !== 'Tab') return;
  const f = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.checkVisibility());
  const end = e.shiftKey ? f[0] : f[f.length - 1];
  if (document.activeElement === end || !box.contains(document.activeElement)) {
    e.preventDefault();
    (e.shiftKey ? f[f.length - 1] : f[0])?.focus();
  }
}

// showModal and close follow open; the opener gets the focus back when the dialog closes.
function useModal(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const back = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      back.current = document.activeElement as HTMLElement | null;
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const on = () => {
      onClose();
      back.current?.focus?.();
    };
    // A late close event after a fast reopen must not close the new dialog.
    const late = () => {
      if (!d.open) on();
    };
    // The focus never leaves the dialog for the browser frame.
    const tab = (e: KeyboardEvent) => wrapTab(e, d);
    // Esc: the close event comes a task later, so a fast Enter on the opener would find the state still open.
    d.addEventListener('cancel', on);
    d.addEventListener('close', late);
    d.addEventListener('keydown', tab);
    return () => {
      d.removeEventListener('cancel', on);
      d.removeEventListener('close', late);
      d.removeEventListener('keydown', tab);
    };
  }, [onClose]);
  return ref;
}

const Kv = ({ k, v }: { k: ReactNode; v: string }) => <div className="kv"><span>{k}</span><b>{v}</b></div>;

export function Help({ open, onClose, keys, onKeys }: { open: boolean; onClose: () => void; keys: boolean; onKeys: (on: boolean) => void }) {
  const ref = useModal(open, onClose);
  return (
    <dialog ref={ref} className="help" id="help" aria-labelledby="help-title" onClick={(e) => e.target === ref.current && ref.current?.close()}>
      <div className="box">
        <div className="hd"><h2 id="help-title">Keyboard shortcuts</h2><button type="button" id="help-close" autoFocus onClick={() => ref.current?.close()}>Close</button></div>
        <Kv k={<><kbd>Ctrl</kbd> <kbd>K</kbd></>} v="Go to a view, a ticket, a session or a team" />
        <Kv k={<><kbd>1</kbd> to <kbd>7</kbd></>} v="Switch view" />
        <Kv k={<kbd>/</kbd>} v="Search the list" />
        <Kv k={<><kbd>j</kbd> <kbd>k</kbd>, then <kbd>Enter</kbd></>} v="Move in the list, open" />
        <Kv k={<><kbd>h</kbd> <kbd>l</kbd></>} v="Previous or next tab" />
        <Kv k={<><kbd>[</kbd> <kbd>]</kbd></>} v="Hide or show the list and the details" />
        <Kv k={<kbd>r</kbd>} v="Refresh now" />
        <Kv k={<kbd>Esc</kbd>} v="Close this, or a drawer" />
        <label><input type="checkbox" id="keys-on" checked={keys} onChange={(e) => onKeys(e.target.checked)} /> Turn on single-key shortcuts. They are off by default, because they get in the way of speech input.</label>
        <p className="hint"><a href="/">Back to v1</a></p>
      </div>
    </dialog>
  );
}

export type PaletteActions = { refresh: () => void; theme: () => void; side: () => void; right: () => void; keys: () => void; help: () => void };
type Item = { id: string; label: string; hint: string; run: () => void };

// Every result comes from the store: no server call.
function items(s: Store, a: PaletteActions): Item[] {
  const go = (h: string) => () => { location.hash = h; };
  const out: Item[] = [];
  for (const v of VIEWS) {
    out.push({ id: `v:${v.id}`, label: v.title, hint: 'View', run: go(viewHash(v.id)) });
    for (const t of v.tabs) out.push({ id: `t:${v.id}/${t.id}`, label: `${v.title}: ${t.label}`, hint: 'Tab', run: go(viewHash(v.id, t.id)) });
  }
  const snap = snapOf(s), q = (snap?.queue ?? {}) as Row, seen = new Set<string>();
  for (const l of [snap?.inflight, snap?.review, snap?.blocked, snap?.open_prs, q.ready, q.skipped]) {
    for (const t of (Array.isArray(l) ? l : []) as Row[]) {
      const k = String(t.key ?? '');
      if (!BELT_KEY_RE.test(k) || seen.has(k)) continue;
      seen.add(k);
      out.push({ id: `k:${k}`, label: `${k} ${String(t.summary ?? t.title ?? '')}`.trim(), hint: 'Ticket', run: go(format({ ...HOME, view: 'pipeline', tab: 'belts', sel: k })) });
    }
  }
  for (const x of sessionList(s)) {
    if (!SESSION_RE.test(x.key)) continue;
    out.push({ id: `s:${x.key}`, label: `${x.key} ${String(x.request ?? x.summary ?? '').slice(0, 80)}`.trim(), hint: 'Session', run: go(`#sessions/${sessTabOf(x.state)}/${x.key}`) });
  }
  for (const t of teamsOf(s) ?? []) {
    const p = String(t.profile ?? '');
    if (TEAM_RE.test(p)) out.push({ id: `team:${p}`, label: String(t.label || p), hint: 'Team', run: go(`#teams/${p}`) });
  }
  for (const [team, l] of Object.entries(s.teamsUi.routines)) {
    if (!TEAM_RE.test(team)) continue;
    for (const r of ((l as Row).routines ?? []) as Row[]) {
      if (/^[1-9][0-9]*$/.test(String(r.id))) out.push({ id: `r:${team}/${r.id}`, label: `${String(r.name ?? `Routine ${r.id}`)} (${team})`, hint: 'Routine', run: go(`#teams/${team}/routines/${r.id}`) });
    }
  }
  for (const e of errorsOf(s) ?? []) {
    const sig = String(e.sig ?? '');
    if (sig) out.push({ id: `e:${sig}`, label: `${sig} ${String(e.message ?? '').slice(0, 80)}`, hint: 'Error', run: go(format({ ...HOME, view: 'errors', tab: 'all', sel: sig })) });
  }
  out.push(
    { id: 'a:refresh', label: 'Refresh', hint: 'Action', run: a.refresh },
    { id: 'a:theme', label: 'Theme: next', hint: 'Action', run: a.theme },
    { id: 'a:side', label: 'Toggle list', hint: 'Action', run: a.side },
    { id: 'a:right', label: 'Toggle details', hint: 'Action', run: a.right },
    { id: 'a:keys', label: `Keyboard shortcuts ${s.prefs.keys ? 'off' : 'on'}`, hint: 'Action', run: a.keys },
    { id: 'a:help', label: 'Show the keyboard shortcuts', hint: 'Action', run: a.help },
    { id: 'a:v1', label: 'Back to v1', hint: 'Action', run: () => { location.href = '/'; } },
  );
  return out;
}

export function Palette({ open, onClose, s, actions }: { open: boolean; onClose: () => void; s: Store; actions: PaletteActions }) {
  const ref = useModal(open, onClose);
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const all = useMemo(() => (open ? items(s, actions) : []), [open, s, actions]);
  const ql = q.trim().toLowerCase();
  const shown = (ql ? all.filter((i) => i.label.toLowerCase().includes(ql)) : all).slice(0, 50);
  const cur = shown[Math.min(at, shown.length - 1)];
  const run = (i: Item | undefined) => {
    if (!i) return;
    ref.current?.close();
    setQ('');
    setAt(0);
    // The dialog gives the focus back first, so an action that moves the focus wins.
    setTimeout(i.run);
  };
  return (
    <dialog ref={ref} className="palette" aria-label="Go to" onClick={(e) => e.target === ref.current && ref.current?.close()}>
      <input type="text" role="combobox" aria-expanded="true" aria-controls="pal-list" aria-autocomplete="list"
        aria-activedescendant={cur ? `pal-${cur.id}` : undefined} aria-label="Go to a view, a ticket, a session, a team, a routine or an error"
        placeholder="Go to…" value={q} autoFocus
        onChange={(e) => { setQ(e.target.value); setAt(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setAt((x) => Math.max(0, Math.min(shown.length - 1, x + (e.key === 'ArrowDown' ? 1 : -1))));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            run(cur);
          }
        }} />
      <ul role="listbox" id="pal-list" aria-label="Results">
        {shown.map((i) => (
          <li key={i.id} id={`pal-${i.id}`} role="option" aria-selected={i === cur} onClick={() => run(i)}>
            <span className="t">{i.label}</span><span className="m">{i.hint}</span>
          </li>
        ))}
        {!shown.length && <li className="empty" role="presentation">Nothing matches.</li>}
      </ul>
    </dialog>
  );
}
