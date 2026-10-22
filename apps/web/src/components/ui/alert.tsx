import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Alert theo designs/components/Alert: luôn có icon và chữ, crit gắn role="alert", ok gắn role="status".
const tones = {
  crit: 'bg-crit-soft text-crit',
  warn: 'bg-warn-soft text-warn',
  ok: 'bg-ok-soft text-ok',
  info: 'bg-info-soft text-info',
} as const;

type AlertProps = {
  tone: keyof typeof tones;
  icon: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function Alert({ tone, icon, children, action, className }: AlertProps) {
  const role = tone === 'crit' ? 'alert' : tone === 'ok' ? 'status' : undefined;
  const bodyInk = tone === 'ok' || tone === 'info' ? 'text-ink' : undefined;
  return (
    <div
      role={role}
      className={cn(
        'flex items-start gap-12 rounded-control px-16 py-12 text-body-sm',
        tones[tone],
        className,
      )}
    >
      <span className="mt-2 flex-none" aria-hidden="true">
        {icon}
      </span>
      <div className={cn('min-w-0 flex-1', bodyInk)}>{children}</div>
      {action}
    </div>
  );
}
