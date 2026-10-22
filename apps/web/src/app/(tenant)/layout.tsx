import { LogOut, Smartphone } from 'lucide-react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { rolesFor } from '@core/modules/identity/permissions';
import { AppError } from '@shared/errors';
import { ROLE_LABELS } from '@shared/labels';
import { AppShell } from '@/components/ui/app-shell/app-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { LogoutButton } from '@/features/identity/logout-button';
import { parseTheme, THEME_COOKIE } from '@/features/theme/constants';
import { requireRole } from '@/server';
import { getIdentityRepo } from '@/server/services';

// Khung chung của mọi màn nghiệp vụ. Kiểm quyền thật ở đây (proxy chỉ kiểm tra lạc quan):
// chưa đăng nhập thì về /login, chưa chọn công ty thì về /select-tenant, tài xế không dùng web.
export default async function TenantLayout({ children }: { children: ReactNode }) {
  let ctx;
  try {
    ctx = await requireRole(rolesFor('web.access'));
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === 'UNAUTHENTICATED') redirect('/login');
      if (error.code === 'NO_TENANT_MEMBERSHIP') redirect('/select-tenant');
      if (error.code === 'FORBIDDEN') return <NoWebAccess />;
    }
    throw error;
  }

  const repo = getIdentityRepo();
  const [user, memberships, cookieStore] = await Promise.all([
    repo.findUserById(ctx.userId),
    repo.listMembershipsOfUser(ctx.userId),
    cookies(),
  ]);
  const tenantName = memberships.find((m) => m.tenantId === ctx.tenantId)?.tenantName ?? '';
  const usable = memberships.filter((m) => m.tenantStatus !== 'CLOSED');

  return (
    <AppShell
      tenantName={tenantName}
      canSwitchTenant={usable.length > 1}
      userName={user?.fullName ?? ''}
      roleLabel={ROLE_LABELS[ctx.role]}
      theme={parseTheme(cookieStore.get(THEME_COOKIE)?.value)}
    >
      {children}
    </AppShell>
  );
}

function NoWebAccess() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-24">
      <div className="w-full max-w-form-wide rounded-card border border-line bg-surface">
        <EmptyState
          icon={<Smartphone className="size-24" />}
          title="Tài khoản này dùng app điện thoại"
          description="Vai trò của bạn chỉ làm việc trên app tài xế. Mở app trên điện thoại hoặc đăng nhập bằng tài khoản khác."
          action={
            <LogoutButton>
              <LogOut className="size-18" aria-hidden="true" />
              Đăng xuất
            </LogoutButton>
          }
        />
      </div>
    </main>
  );
}
