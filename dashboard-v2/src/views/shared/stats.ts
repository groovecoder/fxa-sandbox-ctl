// Parts that Overview, Sandboxes and Stats share: the stats feed note and the outcome tag of a run.
import { ago, sentence } from '../../format';
import type { J } from '../../model/base';
import type { FeedState } from '../../store/types';
import type { Tone } from '../../ui';

// Why the stats figures may be wrong, or "": a failed read keeps the last figures, with their age.
export function statsNote(f: FeedState | undefined, now = Date.now()): string {
  const err = f?.error;
  if (err) return f?.data && f.fetchedAt != null ? `${sentence(err)}. These figures are from ${ago(Math.max(0, Math.round(now / 1000 - f.fetchedAt)))}; the next poll tries again.` : `${sentence(err)}. The next poll tries again.`;
  const a = f?.ageSeconds, i = f?.interval;
  return a != null && i && a > 3 * i ? `The stats feed is ${Math.round(a / 60)} min old.` : '';
}

// The outcome tag of a recent run.
const PR_URL_RE = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/;
export function runBadge(r: J): { label: string; tone: Tone; href: string } {
  if (r.outcome === 'pr') {
    const n = Number.isInteger(r.pr_number) ? r.pr_number : null, m = r.pr_state === 'merged';
    return { label: `${n != null ? `PR #${n}` : 'PR'}${m ? ' merged' : ''}`, tone: m ? 'ok' : 'info', href: PR_URL_RE.test(r.pr_url ?? '') ? r.pr_url : '' };
  }
  const [tone, label] = ({ no_pr: ['dim', 'no change'], failed: ['bad', 'failed'], answered: ['ok', 'answered'], running: ['info', 'running'], done: ['dim', 'done'] } as Record<string, [Tone, string]>)[r.outcome] ?? ['dim', String(r.outcome ?? 'unknown')];
  return { label, tone, href: '' };
}
