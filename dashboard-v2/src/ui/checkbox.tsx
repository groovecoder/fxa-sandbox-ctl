// Adapted from shadcn/ui checkbox (new-york, radix-ui 1.8.1): token classes, a text check mark.
import { Checkbox as C } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cx } from './tone';

export function Checkbox({ className, ...p }: ComponentProps<typeof C.Root>) {
  return (
    <C.Root
      className={cx(
        'inline-flex size-s4 shrink-0 items-center justify-center rounded-sm border border-line2 bg-panel text-tiny leading-none text-on-strong aria-checked:border-link aria-checked:bg-link disabled:opacity-50',
        className,
      )}
      {...p}
    >
      <C.Indicator aria-hidden>✓</C.Indicator>
    </C.Root>
  );
}
