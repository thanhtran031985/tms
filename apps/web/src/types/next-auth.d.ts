import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface User {
    rememberMe?: boolean;
    tenantId?: string;
  }

  interface Session {
    tenantId?: string | null;
    /** Mốc hết hạn phiên (ms epoch) do ứng dụng quản lý. */
    expiresAtMs?: number;
    user: DefaultSession['user'] & { id: string };
  }
}
