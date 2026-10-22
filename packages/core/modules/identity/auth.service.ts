// Nghiệp vụ đăng nhập: kiểm tra mật khẩu, khóa tạm, chọn công ty. Không phụ thuộc Auth.js hay Next;
// Server Action chỉ kiểm quyền/validate rồi gọi service này (CLAUDE.md "Quy tắc code").
import { fail, ok, type Result } from '@shared/result';
import { normalizeIdentifier } from '@shared/schemas/identity';
import { hashPassword, verifyPassword } from './password';
import type { IdentityRepo, UserMembership } from './repo';

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

export type AuthRepo = Pick<
  IdentityRepo,
  | 'findUserById'
  | 'findUserByEmail'
  | 'findUserByPhone'
  | 'listMembershipsOfUser'
  | 'findMembership'
  | 'setLoginState'
  | 'touchMembershipLogin'
>;

export type AuthenticatedUser = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
};

export type AuthenticateData = { user: AuthenticatedUser; memberships: UserMembership[] };

export type TenantAccess =
  | { kind: 'direct'; membership: UserMembership }
  | { kind: 'choose'; memberships: UserMembership[] };

export type AuthServiceDeps = { repo: AuthRepo; now?: () => Date };

// Băm một mật khẩu giả để tài khoản không tồn tại tốn thời gian tương đương tài khoản có thật.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword('mat-khau-gia-de-can-bang-thoi-gian'));

export function createAuthService({ repo, now = () => new Date() }: AuthServiceDeps) {
  const lockedFailure = (lockedUntil: Date) =>
    fail('ACCOUNT_LOCKED', undefined, { details: { lockedUntil: lockedUntil.toISOString() } });

  return {
    async authenticate(input: {
      identifier: string;
      password: string;
    }): Promise<Result<AuthenticateData>> {
      const id = normalizeIdentifier(input.identifier);
      const user =
        id.kind === 'email'
          ? await repo.findUserByEmail(id.value)
          : await repo.findUserByPhone(id.value);

      if (!user || !user.isActive || !user.passwordHash) {
        await verifyPassword(await getDummyHash(), input.password);
        return fail('INVALID_CREDENTIALS');
      }

      const current = now();
      if (user.lockedUntil && user.lockedUntil > current) return lockedFailure(user.lockedUntil);
      // Đã hết hạn khóa thì đếm lại từ 0.
      const baseline = user.lockedUntil ? 0 : user.failedLoginCount;

      if (!(await verifyPassword(user.passwordHash, input.password))) {
        const failed = baseline + 1;
        if (failed >= MAX_FAILED_ATTEMPTS) {
          const lockedUntil = new Date(current.getTime() + LOCK_MINUTES * 60_000);
          await repo.setLoginState(user.id, { failedLoginCount: failed, lockedUntil });
          return lockedFailure(lockedUntil);
        }
        await repo.setLoginState(user.id, { failedLoginCount: failed, lockedUntil: null });
        return fail('INVALID_CREDENTIALS', undefined, {
          details: { attemptsLeft: MAX_FAILED_ATTEMPTS - failed },
        });
      }

      if (user.failedLoginCount !== 0 || user.lockedUntil) {
        await repo.setLoginState(user.id, { failedLoginCount: 0, lockedUntil: null });
      }
      const memberships = await repo.listMembershipsOfUser(user.id);
      return ok({
        user: { id: user.id, fullName: user.fullName, email: user.email, phone: user.phone },
        memberships,
      });
    },

    // Sau đăng nhập: không có công ty → lỗi, một công ty → vào thẳng, nhiều công ty → phải chọn.
    // Công ty đã đóng không được đưa vào lựa chọn.
    async resolveTenantAccess(userId: string): Promise<Result<TenantAccess>> {
      const all = await repo.listMembershipsOfUser(userId);
      const usable = all.filter((m) => m.tenantStatus !== 'CLOSED');
      const [first] = usable;
      if (!first) return fail('NO_TENANT_MEMBERSHIP');
      if (usable.length === 1) return ok({ kind: 'direct', membership: first });
      return ok({ kind: 'choose', memberships: usable });
    },

    // Chọn hoặc đổi công ty: chỉ công ty mà user thật sự có membership. tenantId từ client không được tin.
    async selectTenant(userId: string, tenantId: string): Promise<Result<UserMembership>> {
      const membership = await repo.findMembership(userId, tenantId);
      if (!membership || membership.tenantStatus === 'CLOSED') return fail('FORBIDDEN');
      await repo.touchMembershipLogin(userId, tenantId, now());
      return ok(membership);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
