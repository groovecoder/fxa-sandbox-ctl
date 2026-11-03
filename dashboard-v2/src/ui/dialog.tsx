// Adapted from shadcn/ui dialog (new-york, radix-ui 1.8.1): token classes, no open motion, a Close button with a word.
import { Dialog as D } from 'radix-ui';
import type { ComponentProps } from 'react';
import { buttonClass } from './button';
import { cx } from './tone';

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ className, children, ...p }: ComponentProps<typeof D.Content>) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-ink/40" />
      <D.Content
        className={cx(
          'fixed top-1/2 left-1/2 z-50 flex max-h-full w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-s3 overflow-auto rounded-lg border border-line bg-panel p-s6 text-ink shadow-dialog',
          className,
        )}
        {...p}
      >
        {children}
        <D.Close className={cx(buttonClass(), 'self-end')}>Close</D.Close>
      </D.Content>
    </D.Portal>
  );
}

export function DialogTitle({ className, ...p }: ComponentProps<typeof D.Title>) {
  return <D.Title className={cx('m-0 font-head text-heading font-bold', className)} {...p} />;
}

export function DialogDescription({ className, ...p }: ComponentProps<typeof D.Description>) {
  return <D.Description className={cx('m-0 text-sub text-dim', className)} {...p} />;
}
