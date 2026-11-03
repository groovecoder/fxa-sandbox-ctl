// Adapted from shadcn/ui button (new-york): token classes, two kinds, no cva.
import type { ComponentProps } from 'react';
import { cx } from './tone';

export const buttonClass = (kind: 'plain' | 'strong' = 'plain') =>
  cx(
    'inline-flex items-center gap-s1 rounded-md border px-s3 py-s1 text-sub font-semibold disabled:opacity-50',
    kind === 'strong' ? 'border-link bg-link text-on-strong hover:bg-link-hover' : 'border-line bg-panel text-ink hover:bg-hover',
  );

export function Button({ kind, className, type = 'button', ...p }: ComponentProps<'button'> & { kind?: 'plain' | 'strong' }) {
  return <button type={type} className={cx(buttonClass(kind), className)} {...p} />;
}
