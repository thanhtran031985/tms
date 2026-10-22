// requireRole (spec 01 Rule 4): mọi Server Action / Route Handler bắt đầu bằng `const ctx = await requireRole([...])`.
// Phiên chỉ cho biết userId và tenantId đã chọn; vai trò luôn nạp lại từ DB ở mỗi request nên đổi vai trò,
// vô hiệu tài khoản, gỡ khỏi công ty có hiệu lực ngay. tenantId của ctx chỉ đến từ phiên, không từ input.
import type { RequestContext, Role } from '@core/lib/context';
import { AppError } from '@shared/errors';

export type SessionInfo = { userId: string; tenantId?: string | null };

export type MembershipInfo = {
  role: Role;
  userActive: boolean;
  tenantStatus: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  timezone: string;
};

export type RequireRoleDeps = {
  getSession: () => Promise<SessionInfo | null>;
  loadMembership: (userId: string, tenantId: string) => Promise<MembershipInfo | undefined>;
  newRequestId?: () => string;
};

export type RequireRole = (roles: readonly Role[]) => Promise<RequestContext>;

export function createRequireRole(deps: RequireRoleDeps): RequireRole {
  const newRequestId = deps.newRequestId ?? (() => crypto.randomUUID());

  return async (roles) => {
    const session = await deps.getSession();
    if (!session) throw new AppError('UNAUTHENTICATED');
    if (!session.tenantId) throw new AppError('NO_TENANT_MEMBERSHIP');

    const membership = await deps.loadMembership(session.userId, session.tenantId);
    if (!membership) throw new AppError('FORBIDDEN');
    if (!membership.userActive) throw new AppError('UNAUTHENTICATED');
    if (membership.tenantStatus === 'CLOSED') throw new AppError('FORBIDDEN');
    if (!roles.includes(membership.role)) throw new AppError('FORBIDDEN');

    return {
      tenantId: session.tenantId,
      userId: session.userId,
      role: membership.role,
      requestId: newRequestId(),
      timezone: membership.timezone,
    };
  };
}
