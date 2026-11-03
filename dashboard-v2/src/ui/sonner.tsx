// Adapted from shadcn/ui sonner (sonner 2.0.8): unstyled toasts with token classes, for write results.
import { Toaster as T, type ToasterProps } from 'sonner';

export { toast } from 'sonner';

export function Toaster(p: ToasterProps) {
  return (
    <T
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: 'flex w-full items-start gap-s2 rounded-md border border-line bg-panel p-s3 text-sub text-ink shadow-pop',
          title: 'font-semibold',
          description: 'text-dim',
          error: 'border-bad',
          success: 'border-ok',
          actionButton: 'rounded-sm border border-line px-s2 text-label font-semibold',
        },
      }}
      {...p}
    />
  );
}
