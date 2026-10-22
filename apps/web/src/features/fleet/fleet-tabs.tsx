'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export const FLEET_TABS = [
  { slug: 'tractors', label: 'Đầu kéo', href: '/fleet/tractors' },
  { slug: 'trailers', label: 'Rơ moóc', href: '/fleet/trailers' },
  { slug: 'drivers', label: 'Tài xế', href: '/fleet/drivers' },
  { slug: 'documents', label: 'Theo dõi giấy tờ', href: '/fleet/documents' },
] as const;

export function FleetTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Phân hệ đội xe" className="flex flex-wrap gap-6">
      {FLEET_TABS.map(({ slug, label, href }) => {
        const current = pathname === href || pathname?.startsWith(`${href}/`);
        return (
          <Link
            key={slug}
            href={href}
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
