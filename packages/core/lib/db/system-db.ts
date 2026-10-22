// Truy cập DB cho các bảng TOÀN CỤC (không có tenant_id): users, tenants, tenant_memberships khi tra theo user.
// Chỉ modules/identity/** được import file này (luật ESLint); module nghiệp vụ khác phải dùng getTenantDb(ctx).
import { getDb, type Db } from './client';

export type SystemDb = Db;

export function getSystemDb(): SystemDb {
  return getDb().db;
}
