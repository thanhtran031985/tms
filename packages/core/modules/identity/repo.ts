// Repo identity. Bảng toàn cục (users, tenants) và tra membership theo user đi qua SystemDb;
// danh sách thành viên của một công ty đi qua TenantDb để luôn bị chặn theo tenant.
import { and, desc, eq, sql } from 'drizzle-orm';
import { tenantMemberships, tenants, users } from '../../lib/db/schema';
import type { SystemDb } from '../../lib/db/system-db';
import type { TenantDb } from '../../lib/db/tenant-db';

export type UserRow = typeof users.$inferSelect;

export type UserMembership = {
  membershipId: string;
  tenantId: string;
  tenantName: string;
  tenantStatus: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  timezone: string;
  role: (typeof tenantMemberships.$inferSelect)['role'];
  lastLoginAt: Date | null;
};

export function listTenantMembers(tdb: TenantDb) {
  return tdb.select(tenantMemberships);
}

export function createIdentityRepo(db: SystemDb) {
  const membershipColumns = {
    membershipId: tenantMemberships.id,
    tenantId: tenantMemberships.tenantId,
    tenantName: tenants.name,
    tenantStatus: tenants.status,
    timezone: tenants.timezone,
    role: tenantMemberships.role,
    lastLoginAt: tenantMemberships.lastLoginAt,
  };

  return {
    async findUserById(id: string): Promise<UserRow | undefined> {
      const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return row;
    },

    async findUserByEmail(email: string): Promise<UserRow | undefined> {
      const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return row;
    },

    async findUserByPhone(phone: string): Promise<UserRow | undefined> {
      const [row] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
      return row;
    },

    // Công ty của user, mới đăng nhập nhất lên đầu, chưa đăng nhập lần nào (NULL) xếp cuối.
    async listMembershipsOfUser(userId: string): Promise<UserMembership[]> {
      return db
        .select(membershipColumns)
        .from(tenantMemberships)
        .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
        .where(eq(tenantMemberships.userId, userId))
        .orderBy(
          sql`${tenantMemberships.lastLoginAt} IS NULL`,
          desc(tenantMemberships.lastLoginAt),
          tenants.name,
        );
    },

    async findMembership(userId: string, tenantId: string): Promise<UserMembership | undefined> {
      const [row] = await db
        .select(membershipColumns)
        .from(tenantMemberships)
        .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
        .where(and(eq(tenantMemberships.userId, userId), eq(tenantMemberships.tenantId, tenantId)))
        .limit(1);
      return row;
    },

    async setLoginState(
      userId: string,
      state: { failedLoginCount: number; lockedUntil: Date | null },
    ): Promise<void> {
      await db.update(users).set(state).where(eq(users.id, userId));
    },

    async touchMembershipLogin(userId: string, tenantId: string, at: Date): Promise<void> {
      await db
        .update(tenantMemberships)
        .set({ lastLoginAt: at })
        .where(and(eq(tenantMemberships.userId, userId), eq(tenantMemberships.tenantId, tenantId)));
    },
  };
}

export type IdentityRepo = ReturnType<typeof createIdentityRepo>;
