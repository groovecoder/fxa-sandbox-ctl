// Adapted from shadcn/ui select (new-york, radix-ui 1.8.1): token classes, no scroll buttons, no open motion.
import { Select as S } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cx } from './tone';

export const Select = S.Root;
export const SelectGroup = S.Group;
export const SelectValue = S.Value;

export function SelectTrigger({ className, children, ...p }: ComponentProps<typeof S.Trigger>) {
  return (
    <S.Trigger
      className={cx(
        'inline-flex items-center justify-between gap-s2 rounded-md border border-line bg-panel px-s2 py-s1 text-sub text-ink data-disabled:opacity-50',
        className,
      )}
      {...p}
    >
      {children}
      <S.Icon aria-hidden className="text-faint">
        ▾
      </S.Icon>
    </S.Trigger>
  );
}

export function SelectContent({ className, children, position = 'popper', ...p }: ComponentProps<typeof S.Content>) {
  return (
    <S.Portal>
      <S.Content
        position={position}
        sideOffset={4}
        className={cx('z-50 overflow-hidden rounded-md border border-line bg-panel text-sub text-ink shadow-pop', className)}
        {...p}
      >
        <S.Viewport className="p-s1">{children}</S.Viewport>
      </S.Content>
    </S.Portal>
  );
}

export function SelectItem({ className, children, ...p }: ComponentProps<typeof S.Item>) {
  return (
    <S.Item
      className={cx(
        'flex cursor-default items-center justify-between gap-s3 rounded-sm px-s2 py-s1 select-none data-disabled:opacity-50 data-highlighted:bg-hover',
        className,
      )}
      {...p}
    >
      <S.ItemText>{children}</S.ItemText>
      <S.ItemIndicator aria-hidden className="text-link">
        ✓
      </S.ItemIndicator>
    </S.Item>
  );
}
