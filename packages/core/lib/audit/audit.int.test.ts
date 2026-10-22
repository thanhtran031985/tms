import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestInfra, type TestInfra } from '../../test/containers';
import type { RequestContext } from '../context';
import { tenantMemberships } from '../db/schema';
import { seedIdentity } from '../db/seeds/identity';
import { SEED_TENANTS, SEED_USERS } from '../db/seeds/identity.test-data';
import { getTenantDb } from '../db/tenant-db';
import { writeAudit } from './index';
import { listAuditForEntity } from './repo';

const membership = SEED_USERS.accountant.memberships[0];

describe('writeAudit: cùng transaction với thay đổi (Rule 8)', () => {
  let infra: TestInfra;
  const ctx: RequestContext = {
    tenantId: SEED_TENANTS.phucAn.id,
    userId: SEED_USERS.admin.id,
    role: 'ADMIN',
    requestId: 'req-test',
    timezone: 'Asia/Ho_Chi_Minh',
  };

  beforeAll(async () => {
    infra = await startTestInfra({ redis: false });
    await seedIdentity(infra.db, { password: 'mat-khau-thu-nghiem' });
  });

  afterAll(async () => {
    await infra?.stop();
  });

  const tdb = () => getTenantDb(ctx, { db: infra.db });

  it('commit: thay đổi và audit cùng được lưu, audit ghi người thao tác', async () => {
    await tdb().transaction(async (tx) => {
      await tx.update(
        tenantMemberships,
        { role: 'DISPATCHER' },
        eq(tenantMemberships.id, membership.id),
      );
      await writeAudit(tx, ctx, {
        entity: 'tenant_memberships',
        entityId: membership.id,
        action: 'UPDATE',
        before: { role: 'ACCOUNTANT' },
        after: { role: 'DISPATCHER' },
      });
    });

    const [row] = await tdb().select(tenantMemberships, eq(tenantMemberships.id, membership.id));
    const audits = await listAuditForEntity(tdb(), 'tenant_memberships', membership.id);
    expect(row?.role).toBe('DISPATCHER');
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorUserId: ctx.userId,
      action: 'UPDATE',
      before: { role: 'ACCOUNTANT' },
      after: { role: 'DISPATCHER' },
    });
  });

  it('lỗi giữa transaction: cả thay đổi lẫn audit đều rollback', async () => {
    await expect(
      tdb().transaction(async (tx) => {
        await tx.update(
          tenantMemberships,
          { role: 'VIEWER' },
          eq(tenantMemberships.id, membership.id),
        );
        await writeAudit(tx, ctx, {
          entity: 'tenant_memberships',
          entityId: membership.id,
          action: 'UPDATE',
          before: { role: 'DISPATCHER' },
          after: { role: 'VIEWER' },
        });
        throw new Error('lỗi nghiệp vụ giữa chừng');
      }),
    ).rejects.toThrow('lỗi nghiệp vụ giữa chừng');

    const [row] = await tdb().select(tenantMemberships, eq(tenantMemberships.id, membership.id));
    const audits = await listAuditForEntity(tdb(), 'tenant_memberships', membership.id);
    expect(row?.role).toBe('DISPATCHER');
    expect(audits).toHaveLength(1); // chỉ còn bản ghi của lần commit trước
  });

  it('từ chối khi ctx và tenantDb thuộc hai tenant khác nhau', async () => {
    const other = getTenantDb({ tenantId: SEED_TENANTS.saoViet.id }, { db: infra.db });
    await expect(
      writeAudit(other, ctx, {
        entity: 'orders',
        entityId: membership.id,
        action: 'CREATE',
        before: null,
        after: null,
      }),
    ).rejects.toThrow();
  });
});
