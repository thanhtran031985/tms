import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestInfra, type TestInfra } from '../../test/containers';
import { tenantMemberships } from '../../lib/db/schema';
import { seedIdentity } from '../../lib/db/seeds/identity';
import { SEED_TENANTS, SEED_USERS } from '../../lib/db/seeds/identity.test-data';
import { getTenantDb } from '../../lib/db/tenant-db';
import { createIdentityRepo, listTenantMembers } from './repo';

describe('identity repo: cách ly tenant', () => {
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

  it('thành viên của tenant A không lộ sang tenant B và ngược lại', async () => {
    const a = await listTenantMembers(tenantA());
    const b = await listTenantMembers(tenantB());

    expect(a).toHaveLength(9);
    expect(a.every((m) => m.tenantId === SEED_TENANTS.phucAn.id)).toBe(true);
    expect(b).toHaveLength(3);
    expect(b.every((m) => m.tenantId === SEED_TENANTS.saoViet.id)).toBe(true);
  });

  it('tenant B không sửa được vai trò thành viên của tenant A', async () => {
    const membershipOfA = SEED_USERS.owner.memberships[0]!;

    const affected = await tenantB().update(
      tenantMemberships,
      { role: 'VIEWER' },
      eq(tenantMemberships.id, membershipOfA.id),
    );

    expect(affected).toBe(0);
    const [row] = await tenantA().select(
      tenantMemberships,
      eq(tenantMemberships.id, membershipOfA.id),
    );
    expect(row?.role).toBe('OWNER');
  });

  it('findMembership trả rỗng khi user không thuộc tenant đó', async () => {
    const repo = createIdentityRepo(infra.db);

    expect(
      await repo.findMembership(SEED_USERS.saoVietDispatcher.id, SEED_TENANTS.phucAn.id),
    ).toBeUndefined();
    expect((await repo.findMembership(SEED_USERS.hungDv.id, SEED_TENANTS.saoViet.id))?.role).toBe(
      'DISPATCHER',
    );
  });

  it('tra user theo email, SĐT và id', async () => {
    const repo = createIdentityRepo(infra.db);

    expect((await repo.findUserByEmail('hung.dv@phucan.vn'))?.id).toBe(SEED_USERS.hungDv.id);
    expect((await repo.findUserByPhone('0903000111'))?.id).toBe(SEED_USERS.hungDv.id);
    expect((await repo.findUserById(SEED_USERS.owner.id))?.email).toBe('owner@phucan.vn');
    expect(await repo.findUserByEmail('khong.ton.tai@example.vn')).toBeUndefined();
  });

  it('liệt kê công ty của user kèm vai trò, người chưa có công ty trả mảng rỗng', async () => {
    const repo = createIdentityRepo(infra.db);

    const hung = await repo.listMembershipsOfUser(SEED_USERS.hungDv.id);
    expect(hung.map((m) => m.tenantName).sort()).toEqual(['Logistics Sao Việt', 'Vận tải Phúc An']);
    expect(hung.every((m) => m.role === 'DISPATCHER')).toBe(true);
    expect(await repo.listMembershipsOfUser(SEED_USERS.noTenant.id)).toEqual([]);
  });

  it('listMembershipsOfUser sắp theo lần đăng nhập gần nhất, chưa đăng nhập xếp cuối', async () => {
    const repo = createIdentityRepo(infra.db);
    await repo.touchMembershipLogin(
      SEED_USERS.hungDv.id,
      SEED_TENANTS.saoViet.id,
      new Date('2026-10-20T01:00:00Z'),
    );

    const list = await repo.listMembershipsOfUser(SEED_USERS.hungDv.id);

    expect(list.map((m) => m.tenantId)).toEqual([SEED_TENANTS.saoViet.id, SEED_TENANTS.phucAn.id]);
    expect(list[0]?.lastLoginAt).toEqual(new Date('2026-10-20T01:00:00Z'));
    expect(list[1]?.lastLoginAt).toBeNull();
  });

  it('cập nhật và đọc trạng thái khóa đăng nhập', async () => {
    const repo = createIdentityRepo(infra.db);
    const until = new Date('2026-10-22T08:35:00Z');

    await repo.setLoginState(SEED_USERS.lockTest.id, { failedLoginCount: 5, lockedUntil: until });
    const locked = await repo.findUserById(SEED_USERS.lockTest.id);
    expect(locked?.failedLoginCount).toBe(5);
    expect(locked?.lockedUntil).toEqual(until);

    await repo.setLoginState(SEED_USERS.lockTest.id, { failedLoginCount: 0, lockedUntil: null });
    const open = await repo.findUserById(SEED_USERS.lockTest.id);
    expect(open?.failedLoginCount).toBe(0);
    expect(open?.lockedUntil).toBeNull();
  });
});
