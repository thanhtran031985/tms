import type { JWT } from 'next-auth/jwt';

// Các trường ứng dụng thêm vào JWT. Khai báo riêng vì khai báo mở rộng module của Auth.js không áp dụng được trong monorepo pnpm.
export type AppToken = JWT & {
  tenantId?: string | null;
  rememberMe?: boolean;
  expiresAt?: number;
};
