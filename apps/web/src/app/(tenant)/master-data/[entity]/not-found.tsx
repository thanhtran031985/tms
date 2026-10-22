import { SearchX } from 'lucide-react';
import Link from 'next/link';
import { buttonClass } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export default function MasterDataNotFound() {
  return (
    <div className="rounded-card border border-line bg-surface">
      <EmptyState
        icon={<SearchX className="size-24" />}
        title="Không có danh mục này"
        description="Đường dẫn danh mục không đúng hoặc danh mục đã đổi tên. Chọn một danh mục ở các tab phía trên."
        action={
          <Link href="/master-data/customers" className={buttonClass({ variant: 'secondary' })}>
            Về danh sách khách hàng
          </Link>
        }
      />
    </div>
  );
}
