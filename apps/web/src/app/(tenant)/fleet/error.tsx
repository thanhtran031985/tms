'use client';

import { CircleAlert, RefreshCw } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

// Trạng thái "Lỗi" khi trang không tải được lần đầu (chưa có dữ liệu cũ để giữ).
export default function FleetError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Alert
      tone="crit"
      icon={<CircleAlert className="size-20" />}
      action={
        <Button variant="secondary" size="sm" onClick={reset}>
          <RefreshCw className="size-18" aria-hidden="true" />
          Thử lại
        </Button>
      }
    >
      Không tải được dữ liệu đội xe. Kiểm tra kết nối mạng rồi bấm Thử lại; nếu vẫn lỗi, báo bộ phận
      hỗ trợ.
    </Alert>
  );
}
