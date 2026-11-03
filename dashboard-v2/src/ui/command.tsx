// Adapted from shadcn/ui command (new-york, cmdk 1.1.1): the command palette, token classes, no search icon.
import { Command as C } from 'cmdk';
import { Dialog as D } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cx } from './tone';

export function Command({ className, ...p }: ComponentProps<typeof C>) {
  return <C className={cx('flex flex-col overflow-hidden rounded-md bg-panel text-ink', className)} {...p} />;
}

export function CommandDialog({ title, children, ...p }: ComponentProps<typeof D.Root> & { title: string }) {
  return (
    <D.Root {...p}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-ink/40" />
        <D.Content
          aria-describedby={undefined}
          className="fixed top-s6 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-lg border border-line bg-panel shadow-dialog"
        >
          <D.Title className="sr-only">{title}</D.Title>
          <Command label={title}>{children}</Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function CommandInput({ className, ...p }: ComponentProps<typeof C.Input>) {
  return (
    <C.Input
      className={cx('w-full border-0 border-b border-line bg-transparent px-s3 py-s2 text-body text-ink placeholder:text-faint', className)}
      {...p}
    />
  );
}

export function CommandList({ className, ...p }: ComponentProps<typeof C.List>) {
  return <C.List className={cx('ds-cmdlist overflow-auto p-s1', className)} {...p} />;
}

export function CommandEmpty(p: ComponentProps<typeof C.Empty>) {
  return <C.Empty className="px-s3 py-s4 text-center text-sub text-dim" {...p} />;
}

export function CommandGroup({ className, ...p }: ComponentProps<typeof C.Group>) {
  return <C.Group className={cx('py-s1', className)} {...p} />;
}

export function CommandItem({ className, ...p }: ComponentProps<typeof C.Item>) {
  return (
    <C.Item
      className={cx('flex cursor-default items-center gap-s2 rounded-sm px-s2 py-s1 text-sub select-none aria-selected:bg-hover aria-disabled:opacity-50', className)}
      {...p}
    />
  );
}
