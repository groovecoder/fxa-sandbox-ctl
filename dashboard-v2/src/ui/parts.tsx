// The small parts, ported from the v1 helpers in dashboard/index.html (tag, dot, meter, card, kvRow, emptybox, statTile, checkBars).
import type {
  CardProps,
  CheckBarsProps,
  DotProps,
  EmptyBoxProps,
  KvProps,
  MeterProps,
  StatTileProps,
  TagProps,
  UnknownProps,
} from './index';
import { cx, FILL, TEXT, TONE } from './tone';

export function Tag({ label, tone, run, live, sq, title, href }: TagProps) {
  const c = cx(
    'inline-flex items-center gap-s1 whitespace-nowrap font-semibold tabular-nums',
    sq ? 'rounded-sm px-s1 text-tiny' : 'rounded-pill px-s2 py-px text-label',
    TONE[tone ?? 'dim'],
    run && 'ds-run',
    run && live && 'ds-live',
  );
  return href ? (
    <a className={cx(c, 'no-underline')} href={href} title={title} target="_blank" rel="noreferrer">
      {label}
    </a>
  ) : (
    <span className={c} title={title}>
      {label}
    </span>
  );
}

export function Dot({ tone, label, live }: DotProps) {
  return (
    <span
      role="img"
      aria-label={label}
      className={cx('inline-block size-s2 shrink-0 rounded-pill', tone ? FILL[tone] : 'bg-line2', live && 'ds-pulse')}
    />
  );
}

export function Meter({ pct, tone, label }: MeterProps) {
  const v = pct == null ? null : Math.max(0, Math.min(100, Math.round(pct) || 0));
  return (
    <span
      role="img"
      aria-label={v == null ? `${label}: unknown` : label}
      title={v == null ? 'unknown' : undefined}
      className="block h-s2 overflow-hidden rounded-pill bg-sunk"
    >
      {v != null && (
        <span className={cx('block h-full transition-all duration-300', FILL[tone ?? 'info'])} style={{ width: `${v}%` }} />
      )}
    </span>
  );
}

export function Card({ children, sm, flat, tone, href, className }: CardProps) {
  const c = cx(
    'min-w-0 rounded-lg border',
    sm ? 'px-s4 py-s3' : 'px-s6 py-s4',
    tone === 'bad' ? 'border-bad' : flat ? 'border-line' : 'border-card-border',
    tone === 'warn' ? 'bg-warnbg' : 'bg-panel',
    !flat && 'shadow-card',
    href && 'block text-ink no-underline hover:shadow-hover',
    className,
  );
  return href ? (
    <a className={c} href={href}>
      {children}
    </a>
  ) : (
    <div className={c}>{children}</div>
  );
}

export function Kv({ label, value, na }: KvProps) {
  return (
    <div className="flex justify-between gap-s3 border-t border-line py-s1 text-sub first:border-t-0">
      <span className="text-dim">{label}</span>
      <b className={cx('text-right tabular-nums', na ? 'font-normal text-faint' : 'font-semibold')}>{value}</b>
    </div>
  );
}

export function EmptyBox({ children }: EmptyBoxProps) {
  return <div className="rounded-md border border-dashed border-line2 p-s4 text-center text-sub text-dim">{children}</div>;
}

export function StatTile({ label, tone, value, sub, href }: StatTileProps) {
  return (
    <Card sm href={href}>
      <span className="flex flex-col gap-s1">
        <span className="font-head text-label font-semibold uppercase tracking-wide text-dim">{label}</span>
        <span className={cx('font-head text-kpi leading-tight font-bold tabular-nums', tone && TEXT[tone])}>{value ?? '?'}</span>
        {sub != null && <span className="text-sub text-faint">{sub}</span>}
      </span>
    </Card>
  );
}

export function Unknown({ reason }: UnknownProps) {
  return (
    <span className="text-sub font-semibold text-warn" title={reason}>
      unknown
    </span>
  );
}

export function CheckBars({ ok, fail, running }: CheckBarsProps) {
  if (ok == null && fail == null && running == null) return <Unknown reason="No CI result" />;
  const total = (ok ?? 0) + (fail ?? 0) + (running ?? 0);
  if (total === 0) return null;
  // Past 30 checks the bars scale down, so a long run keeps its width.
  const scale = total > 30 ? 30 / total : 1;
  const w = (n: number | null) => (n != null && n > 0 ? Math.max(1, Math.round(n * scale)) : 0);
  const label = `${ok ?? '?'} passed, ${fail ?? '?'} failed, ${running ?? '?'} running`;
  const bars = (n: number | null, c: string) => Array.from({ length: w(n) }, (_, i) => <i key={c + i} className={c} />);
  return (
    <span className="ds-checks" role="img" aria-label={label} title={label}>
      {bars(fail, 'f bg-bad')}
      {bars(running, 'bg-info')}
      {bars(ok, 'bg-ok')}
    </span>
  );
}
