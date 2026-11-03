// The belt track from v1 (.belt .trk): a base line, the stops, and the current stop, which moves once in 300 ms.
import { cx, FILL } from '../ui/tone';
import type { Tone } from '../ui';
import type { BeltProps } from './index';

const LINE: Record<Tone, string> = {
  ok: 'border-ok',
  warn: 'border-warn',
  bad: 'border-bad',
  info: 'border-info',
  merged: 'border-purple',
  dim: 'border-faint',
};
const RING: Record<Tone, string> = { ok: 'ring-ok', warn: 'ring-warn', bad: 'ring-bad', info: 'ring-info', merged: 'ring-purple', dim: 'ring-faint' };

export function Belt({ stops, at, tone = 'info', label, live }: BeltProps) {
  const n = stops.length;
  const i = Math.max(0, Math.min(n - 1, Math.round(at)));
  const pos = n > 1 ? (i / (n - 1)) * 100 : 0;
  const text = `${label}. Stop ${i + 1} of ${n}, ${stops[i] ?? 'unknown'}`;
  return (
    <div role="img" aria-label={text} title={text} className="relative h-s6">
      {/* The inner box starts and ends at the centres of the first and last stops. */}
      <div className="absolute inset-y-0 right-s1 left-s1">
        <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t-2 border-line" />
        <span
          className={cx('absolute left-0 top-1/2 -translate-y-1/2 border-t-2 transition-all duration-300', LINE[tone])}
          style={{ width: `${pos}%` }}
        />
        {stops.map((s, j) => (
          <span
            key={s + j}
            className={cx(
              'absolute top-1/2 size-s2 -translate-x-1/2 -translate-y-1/2 rounded-pill',
              j < i ? FILL[tone] : 'border-2 border-line2 bg-panel',
            )}
            style={{ left: `${n > 1 ? (j / (n - 1)) * 100 : 0}%` }}
          />
        ))}
        <span
          className={cx(
            'absolute top-1/2 size-s3 -translate-x-1/2 -translate-y-1/2 rounded-pill border-2 border-panel ring-2 transition-all duration-300',
            FILL[tone],
            RING[tone],
            live && 'ds-pulse',
          )}
          style={{ left: `${pos}%` }}
        />
      </div>
    </div>
  );
}
