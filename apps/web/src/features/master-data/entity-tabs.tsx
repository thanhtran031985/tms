'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ENTITY_TABS } from './entities';

// Chuyển giữa 5 danh mục: liên kết thật (mỗi danh mục một URL), dáng viên thuốc giống FilterTabs.
export function EntityTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Loại danh mục" className="flex flex-wrap gap-6">
      {ENTITY_TABS.map(({ slug, label }) => {
        const current = pathname === `/master-data/${slug}`;
        return (
          <Link
            key={slug}
            href={`/master-data/${slug}`}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-tab items-center rounded-pill border border-line px-12 text-small font-medium text-ink no-underline transition-colors duration-150 ease-out hover:bg-surface-2',
              current && 'border-ink bg-ink text-surface hover:bg-ink',
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
