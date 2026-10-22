'use client';

import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

// FilterTabs theo designs/components/FilterTabs: tab viên thuốc có số đếm, tab đầu luôn là "Tất cả".
// Mũi tên trái/phải đổi tab, Home/End về đầu/cuối (mẫu tablist của WAI-ARIA).
export type FilterTab = { id: string; label: string; count: number };

type FilterTabsProps = {
  label: string;
  tabs: FilterTab[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
};

export function FilterTabs({ label, tabs, value, onChange, className }: FilterTabsProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = tabs.length - 1;
    const target =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : -1;
    if (target < 0) return;
    event.preventDefault();
    onChange(tabs[target]!.id);
    refs.current[target]?.focus();
  }

  return (
    <div role="tablist" aria-label={label} className={cn('flex flex-wrap gap-6', className)}>
      {tabs.map((tab, index) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              'inline-flex min-h-tab cursor-pointer items-center gap-6 rounded-pill border border-line bg-transparent px-12 text-small font-medium text-ink transition-colors duration-150 ease-out hover:bg-surface-2',
              selected && 'border-ink bg-ink text-surface hover:bg-ink',
            )}
          >
            {tab.label}
            <span
              className={cn(
                'min-w-20 rounded-pill bg-surface-2 px-6 text-center text-chip-sm text-ink',
                selected && 'bg-surface',
              )}
            >
              {tab.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
