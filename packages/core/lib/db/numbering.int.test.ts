import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestInfra, type TestInfra } from '../../test/containers';
import { nextNumber } from './numbering';
import { seedIdentity } from './seeds/identity';
import { SEED_TENANTS } from './seeds/identity.test-data';
import { getTenantDb } from './tenant-db';

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe('nextNumber: sinh số chứng từ không trùng', () => {
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
  const next = (tdb: ReturnType<typeof tenantA>, key: string) =>
    tdb.transaction((tx) => nextNumber(tx, key));

  it('50 lời gọi song song (50 transaction riêng) ra 50 số khác nhau, liên tiếp từ 1 đến 50', async () => {
    const results = await Promise.all(range(1, 50).map(() => next(tenantA(), 'TEST:2026-10')));

    expect(new Set(results).size).toBe(50);
    expect([...results].sort((a, b) => a - b)).toEqual(range(1, 50));
  });

  it('lặp 5 vòng liên tiếp, mỗi vòng 50 lời gọi song song: không trùng, không deadlock', async () => {
    for (let round = 1; round <= 5; round++) {
      const key = `ROUND:${round}`;
      const results = await Promise.all(range(1, 50).map(() => next(tenantA(), key)));
      expect([...results].sort((a, b) => a - b)).toEqual(range(1, 50));
    }
  });

  it('hai seq_key khác nhau đếm riêng', async () => {
    expect(await next(tenantA(), 'TRIP:2026-10')).toBe(1);
    expect(await next(tenantA(), 'TRIP:2026-10')).toBe(2);
    expect(await next(tenantA(), 'INVOICE:2026')).toBe(1);
    expect(await next(tenantA(), 'TRIP:2026-10')).toBe(3);
  });

  it('hai tenant cùng seq_key đếm riêng, chạy xen kẽ song song', async () => {
    const [a, b] = await Promise.all([
      Promise.all(range(1, 20).map(() => next(tenantA(), 'SHARED:KEY'))),
      Promise.all(range(1, 20).map(() => next(tenantB(), 'SHARED:KEY'))),
    ]);

    expect([...a].sort((x, y) => x - y)).toEqual(range(1, 20));
    expect([...b].sort((x, y) => x - y)).toEqual(range(1, 20));
  });

  it('transaction bị rollback thì số không bị tiêu hao', async () => {
    expect(await next(tenantA(), 'ROLLBACK:KEY')).toBe(1);

    await expect(
      tenantA().transaction(async (tx) => {
        expect(await nextNumber(tx, 'ROLLBACK:KEY')).toBe(2);
        throw new Error('hủy');
      }),
    ).rejects.toThrow('hủy');

    expect(await next(tenantA(), 'ROLLBACK:KEY')).toBe(2);
  });

  it('nhiều số trong cùng một transaction tăng dần', async () => {
    const numbers = await tenantA().transaction(async (tx) => [
      await nextNumber(tx, 'MULTI:KEY'),
      await nextNumber(tx, 'MULTI:KEY'),
      await nextNumber(tx, 'MULTI:KEY'),
    ]);
    expect(numbers).toEqual([1, 2, 3]);
  });

  it('từ chối seq_key rỗng hoặc dài quá 50 ký tự', async () => {
    await expect(next(tenantA(), '')).rejects.toThrow();
    await expect(next(tenantA(), 'x'.repeat(51))).rejects.toThrow();
  });
});
