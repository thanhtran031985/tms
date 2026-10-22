import type { ReactNode } from 'react';
import { EntityTabs } from '@/features/master-data/entity-tabs';

export default function MasterDataLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-20">
      <div>
        <h1 className="text-screen-title text-ink">Danh mục</h1>
        <p className="mt-4 text-ink-soft">
          Khách hàng, hãng tàu, nhà cung cấp, địa điểm và tuyến dùng chung cho bảng giá, Order và
          chuyến xe.
        </p>
      </div>
      <EntityTabs />
      {children}
    </div>
  );
}
