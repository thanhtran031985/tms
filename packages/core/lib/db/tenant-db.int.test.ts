import { asc, desc, eq, or, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestInfra, type TestInfra } from '../../test/containers';
import { auditLogs } from './schema';
import { seedIdentity } from './seeds/identity';
import { SEED_TENANTS } from './seeds/identity.test-data';
import { getTenantDb } from './tenant-db';

const A = { tenantId: SEED_TENANTS.phucAn.id };
const B = { tenantId: SEED_TENANTS.saoViet.id };
const entityId = '0190a000-0000-7000-8000-00000000aaaa';

describe('getTenantDb: cách ly dữ liệu giữa các tenant', () => {
  let infra: TestInfra;

  beforeAll(async () => {
    infra = await startTestInfra({ redis: false });
    await seedIdentity(infra.db, { password: 'mat-khau-thu-nghiem' });
  });

  afterAll(async () => {
    await infra?.stop();
  });

  const dbA = () => getTenantDb(A, { db: infra.db });
  const dbB = () => getTenantDb(B, { db: infra.db });

  const insertAuditA = async (entity: string) => {
    const [row] = await dbA().insert(auditLogs, {
      entity,
      entityId,
      action: 'CREATE',
      createdAt: new Date(),
    });
    return row!;
  };

  it('tenant B không đọc được dòng của tenant A, tenant A vẫn đọc được', async () => {
    const row = await insertAuditA('isolation-read');

    const seenByB = await dbB().select(auditLogs, eq(auditLogs.entity, 'isolation-read'));
    const seenByA = await dbA().select(auditLogs, eq(auditLogs.entity, 'isolation-read'));

    expect(seenByB).toEqual([]);
    expect(seenByA.map((r) => r.id)).toEqual([row.id]);
  });

  it('điều kiện OR do người gọi truyền vào không vượt được rào tenant', async () => {
    const row = await insertAuditA('isolation-or');

    const seenByB = await dbB().select(auditLogs, or(eq(auditLogs.id, row.id), sql`1 = 1`));

    expect(seenByB.every((r) => r.tenantId === B.tenantId)).toBe(true);
    expect(seenByB.find((r) => r.id === row.id)).toBeUndefined();
  });

  it('UPDATE của tenant B không ảnh hưởng dòng nào của tenant A', async () => {
    const row = await insertAuditA('isolation-update');

    const affected = await dbB().update(auditLogs, { action: 'HACKED' }, eq(auditLogs.id, row.id));

    expect(affected).toBe(0);
    const [after] = await dbA().select(auditLogs, eq(auditLogs.id, row.id));
    expect(after?.action).toBe('CREATE');
  });

  it('DELETE của tenant B không xóa dòng nào của tenant A', async () => {
    const row = await insertAuditA('isolation-delete');

    const affected = await dbB().delete(auditLogs, eq(auditLogs.id, row.id));

    expect(affected).toBe(0);
    const stillThere = await dbA().select(auditLogs, eq(auditLogs.id, row.id));
    expect(stillThere).toHaveLength(1);
  });

  it('UPDATE và DELETE của chính tenant A vẫn chạy bình thường', async () => {
    const row = await insertAuditA('own-update-delete');

    expect(await dbA().update(auditLogs, { action: 'UPDATE' }, eq(auditLogs.id, row.id))).toBe(1);
    expect(await dbA().delete(auditLogs, eq(auditLogs.id, row.id))).toBe(1);
  });

  it('INSERT bỏ qua tenantId truyền từ input và dùng ctx.tenantId', async () => {
    const forged = {
      entity: 'isolation-insert',
      entityId,
      action: 'CREATE',
      createdAt: new Date(),
      tenantId: A.tenantId, // giả mạo: client gửi tenantId của công ty khác
    };

    const [row] = await dbB().insert(auditLogs, forged as never);

    expect(row?.tenantId).toBe(B.tenantId);
    expect(await dbA().select(auditLogs, eq(auditLogs.entity, 'isolation-insert'))).toEqual([]);
    expect(await dbB().select(auditLogs, eq(auditLogs.entity, 'isolation-insert'))).toHaveLength(1);
  });

  it('UPDATE không đổi được tenantId của dòng', async () => {
    const row = await insertAuditA('isolation-move');

    await dbA().update(
      auditLogs,
      { tenantId: B.tenantId, action: 'MOVE' } as never,
      eq(auditLogs.id, row.id),
    );

    const [after] = await dbA().select(auditLogs, eq(auditLogs.id, row.id));
    expect(after?.tenantId).toBe(A.tenantId);
    expect(after?.action).toBe('MOVE');
  });

  it('INSERT sinh id UUIDv7 khi bảng có cột id', async () => {
    const row = await insertAuditA('isolation-id');
    expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('transaction giữ nguyên rào tenant và rollback khi lỗi', async () => {
    const outside = await insertAuditA('tx-outside');

    await expect(
      dbB().transaction(async (tx) => {
        expect(await tx.select(auditLogs, eq(auditLogs.id, outside.id))).toEqual([]);
        await tx.insert(auditLogs, {
          entity: 'tx-rollback',
          entityId,
          action: 'CREATE',
          createdAt: new Date(),
        });
        throw new Error('lỗi giữa transaction');
      }),
    ).rejects.toThrow('lỗi giữa transaction');

    expect(await dbB().select(auditLogs, eq(auditLogs.entity, 'tx-rollback'))).toEqual([]);
  });

  it('từ chối ctx không có tenantId', () => {
    expect(() => getTenantDb({ tenantId: '' }, { db: infra.db })).toThrow();
  });

  it('select hỗ trợ orderBy và limit mà vẫn chỉ trong tenant của mình', async () => {
    for (const entity of ['opt-a', 'opt-c', 'opt-b']) await insertAuditA(entity);
    await dbB().insert(auditLogs, {
      entity: 'opt-z',
      entityId,
      action: 'CREATE',
      createdAt: new Date(),
    });
    const only = or(
      eq(auditLogs.entity, 'opt-a'),
      eq(auditLogs.entity, 'opt-b'),
      eq(auditLogs.entity, 'opt-c'),
      eq(auditLogs.entity, 'opt-z'),
    );

    const desc1 = await dbA().select(auditLogs, only, {
      orderBy: [desc(auditLogs.entity)],
      limit: 1,
    });
    const asc2 = await dbA().select(auditLogs, only, {
      orderBy: [asc(auditLogs.entity)],
      limit: 2,
    });

    expect(desc1.map((r) => r.entity)).toEqual(['opt-c']); // opt-z của tenant B không lọt vào
    expect(asc2.map((r) => r.entity)).toEqual(['opt-a', 'opt-b']);
  });

  it('select forUpdate chạy được trong transaction và vẫn bị chặn theo tenant', async () => {
    const row = await insertAuditA('opt-lock');
    const seenByA = await dbA().transaction((tx) =>
      tx.select(auditLogs, eq(auditLogs.id, row.id), { forUpdate: true }),
    );
    const seenByB = await dbB().transaction((tx) =>
      tx.select(auditLogs, eq(auditLogs.id, row.id), { forUpdate: true }),
    );

    expect(seenByA).toHaveLength(1);
    expect(seenByB).toEqual([]);
  });
});
