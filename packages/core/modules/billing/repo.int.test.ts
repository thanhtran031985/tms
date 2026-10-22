import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedIdentity } from '../../lib/db/seeds/identity';
import { SEED_TENANTS } from '../../lib/db/seeds/identity.test-data';
import { seedMasterData } from '../../lib/db/seeds/master-data';
import { SEED_ROUTES } from '../../lib/db/seeds/master-data.test-data';
import { getTenantDb } from '../../lib/db/tenant-db';
import { startTestInfra, type TestInfra } from '../../test/containers';
import { createTariffRepo } from './repo';

const routeA = SEED_ROUTES[0].id; // CL-ST của Phúc An

describe('billing repo: cách ly tenant', () => {
  let infra: TestInfra;

  beforeAll(async () => {
    infra = await startTestInfra({ redis: false });
    await seedIdentity(infra.db, { password: 'mat-khau-thu-nghiem' });
    await seedMasterData(infra.db);
  });

  afterAll(async () => {
    await infra?.stop();
  });

  const repoOf = (tenantId: string) =>
    createTariffRepo(getTenantDb({ tenantId }, { db: infra.db }));
  const repoA = () => repoOf(SEED_TENANTS.phucAn.id);
  const repoB = () => repoOf(SEED_TENANTS.saoViet.id);

  const freight = {
    routeId: routeA,
    containerType: '20DC' as const,
    tripMode: 'SINGLE' as const,
    basePrice: '1800000.00',
    vatRatePercent: '8.00',
    validFrom: '2026-01-01',
  };
  const fee = {
    routeId: null,
    containerType: '20DC' as const,
    tripMode: 'SINGLE' as const,
    feeCategory: 'PASS_THROUGH' as const,
    feeCode: 'LIFT_FEE',
    feeName: 'Phí nâng hạ',
    amount: '600000.00',
    validFrom: '2026-01-01',
  };

  it('freight: tenant B không đọc, không sửa được giá của tenant A', async () => {
    const created = await repoA().freight.insert(freight);

    expect(created.tenantId).toBe(SEED_TENANTS.phucAn.id);
    expect((await repoB().freight.list()).map((r) => r.id)).not.toContain(created.id);
    expect(await repoB().freight.get(created.id)).toBeUndefined();
    expect(await repoB().freight.update(created.id, { basePrice: '1.00' })).toBe(0);
    expect((await repoA().freight.get(created.id))?.basePrice).toBe('1800000.00');
  });

  it('fees: tenant B không đọc, không sửa được phí của tenant A', async () => {
    const created = await repoA().fees.insert(fee);

    expect((await repoB().fees.list()).map((r) => r.id)).not.toContain(created.id);
    expect(await repoB().fees.get(created.id)).toBeUndefined();
    expect(await repoB().fees.update(created.id, { amount: '1.00' })).toBe(0);
    expect((await repoA().fees.get(created.id))?.amount).toBe('600000.00');
  });

  it('ngày hiệu lực là chuỗi YYYY-MM-DD, validTo trống là NULL, mặc định chạy SINGLE và VND', async () => {
    const created = await repoA().freight.insert({ ...freight, containerType: '40HC' });
    const row = await repoA().freight.get(created.id);

    expect(row?.validFrom).toBe('2026-01-01');
    expect(row?.validTo).toBeNull();
    expect(row?.tripMode).toBe('SINGLE');
    expect(row?.currency).toBe('VND');
    expect(row?.isActive).toBe(true);
  });
});
