import { count } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestInfra, type TestInfra } from '../../../test/containers';
import { tenantMemberships, tenants, users } from '../schema';
import { SEED_COUNTS } from './identity.test-data';
import { seedIdentity } from './identity';

describe('seed identity', () => {
  let infra: TestInfra;

  beforeAll(async () => {
    infra = await startTestInfra();
  });

  afterAll(async () => {
    await infra?.stop();
  });

  const counts = async () => {
    const [t] = await infra.db.select({ n: count() }).from(tenants);
    const [u] = await infra.db.select({ n: count() }).from(users);
    const [m] = await infra.db.select({ n: count() }).from(tenantMemberships);
    return { tenants: t?.n, users: u?.n, memberships: m?.n };
  };

  it('chạy hai lần không sinh bản ghi trùng và đúng số dòng', async () => {
    await seedIdentity(infra.db, { password: 'mat-khau-thu-nghiem' });
    const first = await counts();
    await seedIdentity(infra.db, { password: 'mat-khau-thu-nghiem' });
    const second = await counts();

    expect(first).toEqual(SEED_COUNTS);
    expect(second).toEqual(SEED_COUNTS);
  });

  it('mật khẩu được băm, không lưu dạng văn bản thuần', async () => {
    const rows = await infra.db.select({ hash: users.passwordHash }).from(users);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.hash).toMatch(/^\$argon2id\$/);
      expect(row.hash).not.toContain('mat-khau-thu-nghiem');
    }
  });

  it('đặt lại bộ đếm sai mật khẩu và giờ khóa khi seed lại', async () => {
    await infra.pool.query(
      "UPDATE users SET failed_login_count = 4, locked_until = NOW(3) WHERE email = 'khoa.test@phucan.vn'",
    );
    await seedIdentity(infra.db, { password: 'mat-khau-thu-nghiem' });
    const [rows] = await infra.pool.query(
      "SELECT failed_login_count AS n, locked_until AS l FROM users WHERE email = 'khoa.test@phucan.vn'",
    );
    expect(rows).toEqual([{ n: 0, l: null }]);
  });
});
