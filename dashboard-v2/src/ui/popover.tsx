// Adapted from shadcn/ui popover (new-york, radix-ui 1.8.1): token classes, no open motion.
import { Popover as P } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cx } from './tone';

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverAnchor = P.Anchor;

export function PopoverContent({ className, align = 'center', sideOffset = 4, ...p }: ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        align={align}
        sideOffset={sideOffset}
        className={cx('z-50 w-xs rounded-md border border-line bg-panel p-s3 text-sub text-ink shadow-pop', className)}
        {...p}
      />
    </P.Portal>
  );
}
