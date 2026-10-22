import { sql } from 'drizzle-orm';
import { hashPassword } from '../../../modules/identity/password';
import type { Db } from '../client';
import { tenantMemberships, tenants, users } from '../schema';
import { SEED_TENANTS, SEED_USERS } from './identity.test-data';

// Seed identity cho môi trường dev/test: 2 công ty, người dùng đủ vai trò, một người thuộc cả hai công ty
// và một người chưa thuộc công ty nào. Chạy lại nhiều lần không sinh trùng (UUID cố định + upsert).
// Seed lại cũng đặt lại bộ đếm sai mật khẩu và giờ khóa để e2e chạy lặp được.
export async function seedIdentity(db: Db, options: { password: string }): Promise<void> {
  const passwordHash = await hashPassword(options.password);

  for (const tenant of Object.values(SEED_TENANTS)) {
    await db
      .insert(tenants)
      .values({ id: tenant.id, name: tenant.name, taxCode: tenant.taxCode })
      .onDuplicateKeyUpdate({ set: { name: tenant.name, taxCode: tenant.taxCode } });
  }

  for (const user of Object.values(SEED_USERS)) {
    const phone = 'phone' in user ? user.phone : null;
    await db
      .insert(users)
      .values({
        id: user.id,
        email: user.email,
        phone,
        fullName: user.fullName,
        passwordHash,
      })
      .onDuplicateKeyUpdate({
        set: {
          email: user.email,
          phone,
          fullName: user.fullName,
          passwordHash,
          isActive: true,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });

    for (const membership of user.memberships) {
      await db
        .insert(tenantMemberships)
        .values({
          id: membership.id,
          tenantId: membership.tenantId,
          userId: user.id,
          role: membership.role,
        })
        .onDuplicateKeyUpdate({
          set: { role: membership.role, updatedAt: sql`CURRENT_TIMESTAMP(3)` },
        });
    }
  }
}
