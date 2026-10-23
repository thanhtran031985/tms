import type { ReactNode } from 'react';
import { FleetTabs } from '@/features/fleet/fleet-tabs';

export default function FleetLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-20">
      <div>
        <h1 className="text-screen-title text-ink">Đội xe & Tài xế</h1>
        <p className="mt-4 text-ink-soft">
          Quản lý đầu kéo, rơ moóc, danh sách tài xế, lịch bảo dưỡng và theo dõi hạn giấy tờ vận
          tải.
        </p>
      </div>
      <FleetTabs />
      {children}
    </div>
  );
}
