// Auth.js v5: đăng nhập bằng Credentials (email hoặc SĐT + mật khẩu), phiên JWT.
// Vai trò KHÔNG lưu trong JWT: requireRole nạp lại membership từ DB ở mỗi request.
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { loginSchema } from '@shared/schemas/identity';
import { authConfig } from './auth.config';
import { getAuthService, getIdentityRepo } from './server/services';
import { isExpired, sessionExpiry } from './server/session-token';
import type { AppToken } from './types/app-token';

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        identifier: { label: 'Email hoặc số điện thoại' },
        password: { label: 'Mật khẩu', type: 'password' },
        remember: { label: 'Ghi nhớ' },
      },
      async authorize(raw) {
        const parsed = loginSchema.safeParse({
          identifier: raw?.identifier,
          password: raw?.password,
          remember: raw?.remember === 'true',
        });
        if (!parsed.success) return null;

        const service = getAuthService();
        const result = await service.authenticate(parsed.data);
        if (!result.ok) return null;

        const { user } = result.data;
        // Một công ty thì vào thẳng; nhiều công ty thì để trống tenantId, người dùng chọn ở /select-tenant.
        const access = await service.resolveTenantAccess(user.id);
        let tenantId: string | undefined;
        if (access.ok && access.data.kind === 'direct') {
          const selected = await service.selectTenant(user.id, access.data.membership.tenantId);
          if (selected.ok) tenantId = selected.data.tenantId;
        }

        return {
          id: user.id,
          name: user.fullName,
          email: user.email,
          rememberMe: parsed.data.remember,
          tenantId,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token: rawToken, user, trigger, session }) {
      const token = rawToken as AppToken;
      if (user) {
        token.sub = user.id;
        token.rememberMe = user.rememberMe ?? false;
        token.expiresAt = sessionExpiry(token.rememberMe);
        token.tenantId = user.tenantId ?? null;
      }

      // Đổi công ty (selectTenant/switchTenant gọi unstable_update). Dữ liệu từ client không được tin:
      // luôn kiểm tra lại membership trong DB trước khi nhận tenantId.
      if (trigger === 'update' && token.sub && typeof session?.tenantId === 'string') {
        const membership = await getIdentityRepo().findMembership(token.sub, session.tenantId);
        if (membership && membership.tenantStatus !== 'CLOSED')
          token.tenantId = membership.tenantId;
      }

      if (isExpired(token.expiresAt)) return null;
      return token;
    },
  },
});
