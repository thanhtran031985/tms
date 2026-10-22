import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ROLE_LABELS } from '@shared/labels';
import { auth } from '@/auth';
import { SelectTenantView } from '@/features/identity/select-tenant-view';
import { formatDateTime } from '@/lib/format';
import { safeNext } from '@/lib/safe-next';
import { getIdentityRepo } from '@/server/services';

export const metadata: Metadata = { title: 'Chọn công ty – TMS Container' };

export default async function SelectTenantPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect('/login');

  const memberships = (await getIdentityRepo().listMembershipsOfUser(userId)).filter(
    (m) => m.tenantStatus !== 'CLOSED',
  );
  // Đã có công ty đang làm việc mà chỉ thuộc một công ty thì không cần bước chọn.
  if (session.tenantId && memberships.length <= 1) redirect(safeNext(next));

  return (
    <SelectTenantView
      email={session.user.email ?? ''}
      next={safeNext(next)}
      tenants={memberships.map((m) => ({
        tenantId: m.tenantId,
        name: m.tenantName,
        roleLabel: ROLE_LABELS[m.role],
        lastLoginText: m.lastLoginAt
          ? `Đăng nhập lần cuối ${formatDateTime(m.lastLoginAt)}`
          : 'Chưa đăng nhập lần nào',
      }))}
    />
  );
}
