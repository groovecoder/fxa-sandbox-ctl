// Adapted from shadcn/ui tabs (new-york, radix-ui 1.8.1): an underline in link, not a pill.
import { Tabs as T } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cx } from './tone';

export const Tabs = T.Root;

export function TabsList({ className, ...p }: ComponentProps<typeof T.List>) {
  return <T.List className={cx('flex gap-s1 border-b border-line', className)} {...p} />;
}

export function TabsTrigger({ className, ...p }: ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cx(
        '-mb-px border-b-2 border-transparent bg-transparent px-s3 py-s2 text-sub font-semibold text-dim hover:text-ink aria-selected:border-link aria-selected:text-ink',
        className,
      )}
      {...p}
    />
  );
}

export function TabsContent({ className, ...p }: ComponentProps<typeof T.Content>) {
  return <T.Content className={cx('pt-s3', className)} {...p} />;
}
