'use client';

import { CircleAlert, RefreshCw } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

// Trạng thái "Lỗi" khi bảng không tải được lần đầu (chưa có dữ liệu cũ để giữ).
export default function DispatchError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col gap-16">
      <h1 className="m-0 text-screen-title text-ink">Điều vận</h1>
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
        Không tải được bảng điều vận. Gán xe lúc này có thể trùng với người khác, hãy bấm Thử lại
        trước khi gán; nếu vẫn lỗi, báo bộ phận hỗ trợ.
      </Alert>
    </div>
  );
}
