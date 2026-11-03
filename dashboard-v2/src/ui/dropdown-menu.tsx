// Adapted from shadcn/ui dropdown-menu (new-york, radix-ui 1.8.1): token classes, no open motion, no sub menus.
import { DropdownMenu as M } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cx } from './tone';

export const DropdownMenu = M.Root;
export const DropdownMenuTrigger = M.Trigger;
export const DropdownMenuGroup = M.Group;

export function DropdownMenuContent({ className, sideOffset = 4, ...p }: ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        sideOffset={sideOffset}
        className={cx('z-50 min-w-3xs rounded-md border border-line bg-panel p-s1 text-sub text-ink shadow-pop', className)}
        {...p}
      />
    </M.Portal>
  );
}

export function DropdownMenuItem({ className, ...p }: ComponentProps<typeof M.Item>) {
  return (
    <M.Item
      className={cx('cursor-default rounded-sm px-s2 py-s1 select-none data-disabled:opacity-50 data-highlighted:bg-hover', className)}
      {...p}
    />
  );
}

export function DropdownMenuLabel({ className, ...p }: ComponentProps<typeof M.Label>) {
  return <M.Label className={cx('px-s2 py-s1 text-label font-semibold text-dim', className)} {...p} />;
}

export function DropdownMenuSeparator({ className, ...p }: ComponentProps<typeof M.Separator>) {
  return <M.Separator className={cx('my-s1 h-px bg-line', className)} {...p} />;
}
