// Adapted from shadcn/ui sheet (new-york, radix-ui 1.8.1): the drawer below 1280 and 900 px, token classes, no slide motion.
import { Dialog as D } from 'radix-ui';
import type { ComponentProps } from 'react';
import { buttonClass } from './button';
import { cx } from './tone';

export const Sheet = D.Root;
export const SheetTrigger = D.Trigger;
export const SheetClose = D.Close;
export const SheetTitle = D.Title;
export const SheetDescription = D.Description;

export function SheetContent({ side = 'right', className, children, ...p }: ComponentProps<typeof D.Content> & { side?: 'left' | 'right' }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-ink/40" />
      <D.Content
        className={cx(
          'fixed inset-y-0 z-50 flex w-full max-w-sm flex-col gap-s3 overflow-auto border-line bg-panel p-s4 text-ink shadow-drawer',
          side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
          className,
        )}
        {...p}
      >
        <D.Close className={cx(buttonClass(), 'self-end')}>Close</D.Close>
        {children}
      </D.Content>
    </D.Portal>
  );
}
