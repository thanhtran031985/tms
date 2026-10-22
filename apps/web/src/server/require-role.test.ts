import { rolesFor } from '@core/modules/identity/permissions';
import { AppError } from '@shared/errors';
import { describe, expect, it, vi } from 'vitest';
import { createRequireRole, type MembershipInfo, type RequireRoleDeps } from './require-role';

const membership = (over: Partial<MembershipInfo> = {}): MembershipInfo => ({
  role: 'DISPATCHER',
  userActive: true,
  tenantStatus: 'ACTIVE',
  timezone: 'Asia/Ho_Chi_Minh',
  ...over,
});

const make = (opts: {
  session?: { userId: string; tenantId?: string | null } | null;
  membership?: MembershipInfo | undefined;
}) => {
  const loadMembership = vi.fn<RequireRoleDeps['loadMembership']>(async () => opts.membership);
  const requireRole = createRequireRole({
    getSession: async () => opts.session ?? null,
    loadMembership,
    newRequestId: () => 'req-1',
  });
  return { requireRole, loadMembership };
};

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof AppError ? error.code : 'KHÁC';
  }
};

const session = { userId: 'u1', tenantId: 't1' };

describe('requireRole', () => {
  it('chưa đăng nhập → UNAUTHENTICATED', async () => {
    const { requireRole } = make({ session: null });
    expect(await codeOf(requireRole(rolesFor('order.write')))).toBe('UNAUTHENTICATED');
  });

  it('đã đăng nhập nhưng chưa chọn công ty → NO_TENANT_MEMBERSHIP', async () => {
    const { requireRole } = make({ session: { userId: 'u1', tenantId: null } });
    expect(await codeOf(requireRole(rolesFor('order.write')))).toBe('NO_TENANT_MEMBERSHIP');
  });

  it('không còn membership ở công ty đã chọn → FORBIDDEN', async () => {
    const { requireRole } = make({ session, membership: undefined });
    expect(await codeOf(requireRole(rolesFor('order.write')))).toBe('FORBIDDEN');
  });

  it('tài khoản bị vô hiệu → UNAUTHENTICATED, công ty đã đóng → FORBIDDEN', async () => {
    const inactive = make({ session, membership: membership({ userActive: false }) });
    expect(await codeOf(inactive.requireRole(rolesFor('order.write')))).toBe('UNAUTHENTICATED');
    const closed = make({ session, membership: membership({ tenantStatus: 'CLOSED' }) });
    expect(await codeOf(closed.requireRole(rolesFor('order.write')))).toBe('FORBIDDEN');
  });

  it('VIEWER gọi việc ghi bị FORBIDDEN, vẫn đọc được báo cáo', async () => {
    const { requireRole } = make({ session, membership: membership({ role: 'VIEWER' }) });
    expect(await codeOf(requireRole(rolesFor('order.write')))).toBe('FORBIDDEN');
    await expect(requireRole(rolesFor('report.view'))).resolves.toMatchObject({ role: 'VIEWER' });
  });

  it('DRIVER không vào được việc của web', async () => {
    const { requireRole } = make({ session, membership: membership({ role: 'DRIVER' }) });
    expect(await codeOf(requireRole(rolesFor('web.access')))).toBe('FORBIDDEN');
  });

  it('thành công trả ctx với tenantId lấy từ phiên, không từ nơi khác', async () => {
    const { requireRole, loadMembership } = make({ session, membership: membership() });

    const ctx = await requireRole(rolesFor('order.write'));

    expect(loadMembership).toHaveBeenCalledWith('u1', 't1');
    expect(ctx).toEqual({
      tenantId: 't1',
      userId: 'u1',
      role: 'DISPATCHER',
      requestId: 'req-1',
      timezone: 'Asia/Ho_Chi_Minh',
    });
  });
});
