import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type StatusTone = 'crit' | 'warn' | 'ok' | 'off' | 'info' | 'neutral';

const TONE_CLASSES: Record<StatusTone, string> = {
  crit: 'bg-crit-soft text-crit',
  warn: 'bg-warn-soft text-warn',
  ok: 'bg-ok-soft text-ok',
  off: 'bg-off-soft text-off',
  info: 'bg-info-soft text-info',
  neutral: 'bg-surface-2 text-ink-soft',
};

export function StatusChip({
  tone,
  icon: Icon,
  children,
  size = 'md',
  className,
}: {
  tone: StatusTone;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  children: ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const isSm = size === 'sm';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-6 whitespace-nowrap font-bold',
        isSm ? 'rounded-chip-sm px-6 py-1 text-caption' : 'rounded-chip px-8 py-2 text-chip',
        TONE_CLASSES[tone],
        className,
      )}
    >
      <Icon className={isSm ? 'h-12 w-12 shrink-0' : 'h-14 w-14 shrink-0'} aria-hidden={true} />
      <span>{children}</span>
    </span>
  );
}
