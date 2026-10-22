import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestInfra, type TestInfra } from '../../test/containers';
import { seedIdentity } from '../db/seeds/identity';
import { SEED_TENANTS, SEED_USERS } from '../db/seeds/identity.test-data';
import { getTenantDb } from '../db/tenant-db';
import { insertAudit, listAuditForEntity } from './repo';

const entityId = '0190a000-0000-7000-8000-00000000bbbb';

describe('audit repo: cách ly tenant', () => {
  let infra: TestInfra;

  beforeAll(async () => {
    infra = await startTestInfra({ redis: false });
    await seedIdentity(infra.db, { password: 'mat-khau-thu-nghiem' });
  });

  afterAll(async () => {
    await infra?.stop();
  });

  const tenantA = () => getTenantDb({ tenantId: SEED_TENANTS.phucAn.id }, { db: infra.db });
  const tenantB = () => getTenantDb({ tenantId: SEED_TENANTS.saoViet.id }, { db: infra.db });

  it('ghi audit gắn tenant và người thao tác, tenant khác không đọc được', async () => {
    await insertAudit(tenantA(), {
      actorUserId: SEED_USERS.admin.id,
      entity: 'orders',
      entityId,
      action: 'CREATE',
      before: null,
      after: { status: 'DRAFT' },
    });

    const seenByA = await listAuditForEntity(tenantA(), 'orders', entityId);
    const seenByB = await listAuditForEntity(tenantB(), 'orders', entityId);

    expect(seenByA).toHaveLength(1);
    expect(seenByA[0]).toMatchObject({
      tenantId: SEED_TENANTS.phucAn.id,
      actorUserId: SEED_USERS.admin.id,
      action: 'CREATE',
      before: null,
      after: { status: 'DRAFT' },
    });
    expect(seenByB).toEqual([]);
  });

  it('từ chối before/after không phải đối tượng JSON', async () => {
    await expect(
      insertAudit(tenantA(), {
        actorUserId: null,
        entity: 'orders',
        entityId,
        action: 'UPDATE',
        before: 'chuỗi trần' as never,
        after: null,
      }),
    ).rejects.toThrow();
  });
});
