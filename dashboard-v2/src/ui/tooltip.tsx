// Adapted from shadcn/ui tooltip (new-york, radix-ui 1.8.1): token classes, no arrow, no open motion.
import { Tooltip as T } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cx } from './tone';

export function TooltipProvider({ delayDuration = 300, ...p }: ComponentProps<typeof T.Provider>) {
  return <T.Provider delayDuration={delayDuration} {...p} />;
}
export const Tooltip = T.Root;
export const TooltipTrigger = T.Trigger;

export function TooltipContent({ className, sideOffset = 4, ...p }: ComponentProps<typeof T.Content>) {
  return (
    <T.Portal>
      <T.Content
        sideOffset={sideOffset}
        className={cx('z-50 max-w-xs rounded-sm bg-ink px-s2 py-s1 text-label text-panel', className)}
        {...p}
      />
    </T.Portal>
  );
}
