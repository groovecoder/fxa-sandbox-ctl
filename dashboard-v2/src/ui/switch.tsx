// Adapted from shadcn/ui switch (new-york, radix-ui 1.8.1): role=switch with aria-checked, token colours, v1 size.
import { Switch as S } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cx } from './tone';

export function Switch({ className, ...p }: ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cx(
        'ds-switch inline-flex shrink-0 items-center rounded-pill border border-line2 bg-sunk px-px aria-checked:border-ok aria-checked:bg-ok disabled:opacity-50',
        className,
      )}
      {...p}
    >
      <S.Thumb className="block rounded-pill bg-panel shadow-card" />
    </S.Root>
  );
}
