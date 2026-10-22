import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// StatusChip: tms-pill (vai trò) và tms-badge (số đếm) theo designs/components/StatusChip.
export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-pill bg-info-soft px-10 py-2 text-small font-semibold text-info',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex min-w-20 items-center justify-center rounded-pill bg-crit-soft px-6 text-chip text-crit',
        className,
      )}
    >
      {children}
    </span>
  );
}
