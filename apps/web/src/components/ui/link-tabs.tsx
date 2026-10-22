'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

// Tab chuyển trang: liên kết thật (mỗi tab một URL), dáng viên thuốc giống FilterTabs; tab hiện tại có aria-current.
export type LinkTab = { href: string; label: string };

export function LinkTabs({ label, items }: { label: string; items: LinkTab[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="flex flex-wrap gap-6">
      {items.map(({ href, label: text }) => {
        const current = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-tab items-center rounded-pill border border-line px-12 text-small font-medium text-ink no-underline transition-colors duration-150 ease-out hover:bg-surface-2',
              current && 'border-ink bg-ink text-surface hover:bg-ink',
            )}
          >
            {text}
          </Link>
        );
      })}
    </nav>
  );
}
