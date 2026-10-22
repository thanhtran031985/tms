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

// StatusChip: trạng thái luôn kèm icon và chữ (designs/components/StatusChip), không chỉ báo bằng màu.
const chipTones = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  crit: 'bg-crit-soft text-crit',
  info: 'bg-info-soft text-info',
  off: 'bg-off-soft text-off',
} as const;

export function StatusChip({
  tone,
  icon,
  children,
  className,
}: {
  tone: keyof typeof chipTones;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-6 whitespace-nowrap rounded-chip px-8 py-2 text-chip',
        chipTones[tone],
        className,
      )}
    >
      <span aria-hidden="true" className="flex-none">
        {icon}
      </span>
      {children}
    </span>
  );
}
