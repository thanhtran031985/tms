'use client';

import {
  BarChart3,
  Columns3,
  CircleDollarSign,
  FileText,
  Fuel,
  House,
  Map as MapIcon,
  ArrowUpDown,
  Database,
  Truck,
  Tags,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Badge } from '../pill';

type NavItem = {
  label: string;
  /** Chưa có href: phân hệ chưa làm, hiện ở trạng thái chưa có trang. */
  href?: string;
  /** Tiền tố đường dẫn cũng tính là đang ở mục này (vd. /master-data/*). */
  match?: string;
  icon: LucideIcon;
  badge?: number;
};

// Mục menu theo designs/components/AppShell. Phân hệ nào chưa có trang thì không có href.
export const NAV_ITEMS: NavItem[] = [
  { label: 'Trang chủ', href: '/', icon: House },
  { label: 'Điều vận', icon: Columns3 },
  { label: 'Đơn hàng', href: '/orders', match: '/orders', icon: FileText },
  { label: 'Bản đồ đội xe', icon: MapIcon },
  { label: 'Đội xe & Tài xế', href: '/fleet/tractors', match: '/fleet', icon: Truck },
  { label: 'Phiếu dầu', icon: Fuel },
  { label: 'Đối soát', icon: ArrowUpDown },
  { label: 'Phân bổ chi phí', icon: CircleDollarSign },
  { label: 'Báo cáo', icon: BarChart3 },
  { label: 'Danh mục', href: '/master-data/customers', match: '/master-data', icon: Database },
  { label: 'Bảng giá', href: '/billing/tariffs', match: '/billing', icon: Tags },
];

const itemClass =
  'flex min-h-hit items-center gap-12 rounded-control px-12 text-body-sm font-medium text-ink transition-colors duration-150 ease-out';

export function NavMenu({ items = NAV_ITEMS }: { items?: NavItem[] }) {
  const pathname = usePathname();
  return (
    <ul className="m-0 flex list-none flex-col gap-4 p-0">
      {items.map(({ label, href, match, icon: Icon, badge }) => {
        const content = (
          <>
            <Icon className="size-20 flex-none" aria-hidden="true" />
            <span className="flex-1">{label}</span>
            {badge ? <Badge>{badge}</Badge> : null}
          </>
        );
        if (!href) {
          return (
            <li key={label}>
              <span
                role="link"
                aria-disabled="true"
                title="Chưa có trang"
                className={cn(itemClass, 'cursor-not-allowed text-ink-soft')}
              >
                {content}
              </span>
            </li>
          );
        }
        const current = pathname === href || (!!match && pathname.startsWith(`${match}/`));
        return (
          <li key={label}>
            <Link
              href={href}
              aria-current={current ? 'page' : undefined}
              className={cn(
                itemClass,
                'hover:bg-surface-2',
                current && 'bg-info-soft font-semibold text-info hover:bg-info-soft',
              )}
            >
              {content}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
