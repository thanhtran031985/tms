import { SearchX } from 'lucide-react';
import Link from 'next/link';
import { buttonClass } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export default function OrderNotFound() {
  return (
    <div className="rounded-card border border-line bg-surface">
      <EmptyState
        icon={<SearchX className="size-24" />}
        title="Không tìm thấy Order này"
        description="Order có thể đã bị xóa, hoặc đường dẫn không đúng, hoặc Order không thuộc công ty đang chọn."
        action={
          <Link href="/orders" className={buttonClass({ variant: 'secondary' })}>
            Về danh sách Order
          </Link>
        }
      />
    </div>
  );
}
