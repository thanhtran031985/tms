'use client';

import { Building2, ChevronLeft, Phone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button, buttonClass } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { TenantPicker, type TenantChoice } from '@/components/ui/tenant-picker';
import { logout, selectTenant } from './actions';

type SelectTenantViewProps = {
  email: string;
  tenants: TenantChoice[];
  next: string;
};

// Bước chọn công ty (TenantPicker) sau đăng nhập, và trạng thái Trống khi tài khoản chưa có công ty nào.
export function SelectTenantView({ email, tenants, next }: SelectTenantViewProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const choose = (tenantId: string) => {
    setErrorMessage(null);
    setPendingId(tenantId);
    startTransition(async () => {
      const result = await selectTenant({ tenantId });
      if (result.ok) {
        router.replace(next);
        router.refresh();
        return;
      }
      setPendingId(null);
      setErrorMessage(result.message);
    });
  };

  const changeAccount = () => {
    startTransition(async () => {
      await logout();
      router.replace('/login');
      router.refresh();
    });
  };

  return (
    <div className="flex w-full max-w-form-wide flex-col gap-20">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={changeAccount}
          disabled={pending}
          className="-ml-10 h-hit px-10 font-normal"
        >
          <ChevronLeft className="size-18" aria-hidden="true" />
          <span>Đổi tài khoản</span>
        </Button>
        <h2 className="mb-4 mt-8 text-screen-title">Chọn công ty để làm việc</h2>
        <p className="text-ink-soft">
          {tenants.length > 0
            ? `Tài khoản ${email} có quyền ở ${tenants.length} công ty. Chọn công ty bạn muốn làm việc.`
            : `Tài khoản ${email} đăng nhập đúng nhưng chưa có quyền ở công ty nào.`}
        </p>
      </div>

      {errorMessage ? (
        <Alert tone="crit" icon={<Building2 className="size-20" />}>
          {errorMessage}
        </Alert>
      ) : null}

      {tenants.length > 0 ? (
        <TenantPicker
          tenants={tenants}
          onSelect={choose}
          disabled={pending}
          pendingTenantId={pendingId}
        />
      ) : (
        <div className="rounded-card border border-line bg-surface">
          <EmptyState
            icon={<Building2 className="size-24" />}
            title="Tài khoản chưa được gán vào công ty nào"
            description={`Quản trị viên của công ty bạn cần thêm ${email} vào danh sách người dùng và chọn vai trò. Sau đó đăng nhập lại là thấy công ty ở đây.`}
            action={
              <a href="tel:19001234" className={buttonClass({ variant: 'primary' })}>
                <Phone className="size-18" aria-hidden="true" />
                Liên hệ quản trị · 1900 1234
              </a>
            }
          />
        </div>
      )}
    </div>
  );
}
