import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// EmptyState theo designs/components/EmptyState: vì sao trống, khi nào sẽ có, tối đa một hành động.
type EmptyStateProps = {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  /** Trống là tin tốt (vd. không còn việc nào). */
  tone?: 'neutral' | 'ok';
  className?: string;
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = 'neutral',
  className,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn('flex flex-col items-center gap-8 px-20 py-32 text-center', className)}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-hit items-center justify-center rounded-pill',
          tone === 'ok' ? 'bg-ok-soft text-ok' : 'bg-surface-2 text-ink-soft',
        )}
      >
        {icon}
      </span>
      <h3 className="text-section-title text-ink">{title}</h3>
      <p className="max-w-form text-body text-ink-soft">{description}</p>
      {action ? <div className="mt-8">{action}</div> : null}
    </div>
  );
}
