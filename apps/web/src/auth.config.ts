// Cấu hình Auth.js an toàn cho edge/proxy: không import DB hay argon2. Phần có DB nằm ở auth.ts.
import type { NextAuthConfig } from 'next-auth';
import { COOKIE_MAX_AGE_SECONDS } from './server/session-token';
import type { AppToken } from './types/app-token';

export const authConfig = {
  pages: { signIn: '/login' },
  session: { strategy: 'jwt', maxAge: COOKIE_MAX_AGE_SECONDS },
  providers: [],
  callbacks: {
    session({ session, token }) {
      const t = token as AppToken;
      if (t.sub) session.user.id = t.sub;
      session.tenantId = t.tenantId ?? null;
      if (t.expiresAt) session.expiresAtMs = t.expiresAt;
      return session;
    },
  },
} satisfies NextAuthConfig;
