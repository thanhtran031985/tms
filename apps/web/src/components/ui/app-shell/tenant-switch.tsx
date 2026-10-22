'use client';

import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { tenantInitials } from '../tenant-picker';

const frame =
  'flex h-hit items-center gap-10 rounded-control border border-line bg-surface px-12 text-body-sm text-ink';

// Nút đổi công ty trên thanh trên: mở bước chọn công ty (TenantPicker) và quay lại đúng trang đang xem.
// Người chỉ thuộc một công ty thì chỉ hiện tên công ty, không có nút.
export function TenantSwitch({
  tenantName,
  canSwitch,
}: {
  tenantName: string;
  canSwitch: boolean;
}) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const current = search ? `${pathname}?${search}` : pathname;

  const content = (
    <>
      <span
        aria-hidden="true"
        className="flex size-28 flex-none items-center justify-center rounded-chip bg-surface-2 text-chip text-ink"
      >
        {tenantInitials(tenantName)}
      </span>
      <span className="font-semibold">{tenantName}</span>
    </>
  );

  if (!canSwitch) {
    return (
      <div className={frame} aria-label={`Công ty đang làm việc: ${tenantName}`}>
        {content}
      </div>
    );
  }
  return (
    <Link
      href={`/select-tenant?next=${encodeURIComponent(current)}`}
      aria-label={`Đổi công ty, đang ở ${tenantName}`}
      className={`${frame} transition-colors duration-150 ease-out hover:bg-surface-2`}
    >
      {content}
      <ChevronDown className="size-16 flex-none" aria-hidden="true" />
    </Link>
  );
}
