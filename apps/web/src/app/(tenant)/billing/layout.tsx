import type { ReactNode } from 'react';
import { LinkTabs } from '@/components/ui/link-tabs';

const TABS = [
  { href: '/billing/tariffs', label: 'Giá cước' },
  { href: '/billing/fees', label: 'Bảng phí' },
  { href: '/billing/import', label: 'Nhập từ Excel' },
];

export default function BillingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-20">
      <div>
        <h1 className="text-screen-title text-ink">Bảng giá</h1>
        <p className="mt-4 text-ink-soft">
          Giá cước thu khách và bảng phí theo tuyến, loại container, chế độ chạy và khách hàng.
        </p>
      </div>
      <LinkTabs label="Loại bảng giá" items={TABS} />
      {children}
    </div>
  );
}
