import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Pill } from './pill';

// TenantPicker theo designs/components/TenantPicker: mỗi dòng cao tối thiểu 72px, chữ tắt 44x44, vai trò là pill.
export type TenantChoice = {
  tenantId: string;
  name: string;
  roleLabel: string;
  /** Chuỗi đã định dạng, ví dụ "Đăng nhập lần cuối 20/10/2026 08:00" hoặc "Chưa đăng nhập lần nào". */
  lastLoginText: string;
};

// Chữ tắt từ hai từ cuối của tên công ty: "Vận tải Phúc An" thành "PA".
export function tenantInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const pick = words.length >= 2 ? words.slice(-2) : words;
  return pick
    .map((w) => w.charAt(0))
    .join('')
    .toUpperCase();
}

type TenantPickerProps = {
  tenants: TenantChoice[];
  onSelect: (tenantId: string) => void;
  /** Khóa tất cả dòng khi đang chuyển công ty. */
  disabled?: boolean;
  pendingTenantId?: string | null;
};

export function TenantPicker({
  tenants,
  onSelect,
  disabled = false,
  pendingTenantId,
}: TenantPickerProps) {
  return (
    <ul className="m-0 flex list-none flex-col gap-12 p-0">
      {tenants.map((tenant) => (
        <li key={tenant.tenantId}>
          <button
            type="button"
            disabled={disabled}
            aria-busy={pendingTenantId === tenant.tenantId || undefined}
            onClick={() => onSelect(tenant.tenantId)}
            className={cn(
              'flex min-h-72 w-full items-center gap-16 rounded-card border border-line bg-surface p-16 text-left text-ink transition-colors duration-150 ease-out',
              'hover:border-primary hover:bg-info-soft disabled:cursor-not-allowed disabled:opacity-70',
            )}
          >
            <span className="flex size-hit flex-none items-center justify-center rounded-control bg-surface-2 text-body font-bold">
              {tenantInitials(tenant.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-button font-semibold">{tenant.name}</span>
              <span className="block text-small text-ink-soft">{tenant.lastLoginText}</span>
            </span>
            <Pill>{tenant.roleLabel}</Pill>
            <ChevronRight className="size-20 flex-none text-ink-soft" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
