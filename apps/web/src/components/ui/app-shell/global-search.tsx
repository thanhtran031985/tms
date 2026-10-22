'use client';

import { Search } from 'lucide-react';
import { useEffect, useRef } from 'react';

// Ô tìm trên thanh trên: cao 44px, phím tắt "/" đưa con trỏ vào ô. Chưa tìm thật (task sau).
export function GlobalSearch() {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;
      if (typing) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="relative min-w-0 max-w-form-wide flex-[1_1_100%] sm:flex-[1_1_auto]">
      <label htmlFor="global-search" className="sr-only">
        Tìm container, Order, biển số
      </label>
      <Search
        className="pointer-events-none absolute left-14 top-1/2 size-18 -translate-y-1/2 text-ink-soft"
        aria-hidden="true"
      />
      <input
        id="global-search"
        ref={inputRef}
        type="search"
        placeholder="Tìm container, Order, biển số"
        className="h-hit w-full rounded-control border border-line-strong bg-surface pl-42 pr-48 text-body-sm text-ink transition-colors duration-150 ease-out placeholder:text-ink-soft hover:border-ink-soft"
      />
      <kbd className="pointer-events-none absolute right-12 top-1/2 -translate-y-1/2 rounded-chip-sm border border-line px-6 font-ui text-chip font-normal text-ink-soft">
        /
      </kbd>
    </div>
  );
}
