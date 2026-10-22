import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTariffRepo } from '../../../modules/billing/repo';
import { startTestInfra, type TestInfra } from '../../../test/containers';
import { getTenantDb } from '../tenant-db';
import { seedIdentity } from './identity';
import { SEED_TENANTS } from './identity.test-data';
import { seedMasterData } from './master-data';
import { seedTariffs } from './tariffs';

describe('seed bảng giá', () => {
  let infra: TestInfra;

  beforeAll(async () => {
    infra = await startTestInfra({ redis: false });
    await seedIdentity(infra.db, { password: 'mat-khau-thu-nghiem' });
    await seedMasterData(infra.db);
    await seedTariffs(infra.db);
    await seedTariffs(infra.db); // chạy lại lần hai không sinh trùng
  });

  afterAll(async () => {
    await infra?.stop();
  });

  const repoOf = (tenantId: string) =>
    createTariffRepo(getTenantDb({ tenantId }, { db: infra.db }));

  it('chạy hai lần không sinh bản ghi trùng', async () => {
    const a = repoOf(SEED_TENANTS.phucAn.id);
    const b = repoOf(SEED_TENANTS.saoViet.id);
    expect(await a.freight.list()).toHaveLength(4);
    expect(await a.fees.list()).toHaveLength(7);
    expect(await b.freight.list()).toHaveLength(1);
    expect(await b.fees.list()).toHaveLength(1);
  });

  it('có giá chung SINGLE 20DC/40HC, TWIN_20 chung và giá riêng một khách', async () => {
    const rows = await repoOf(SEED_TENANTS.phucAn.id).freight.list();
    const key = (r: (typeof rows)[number]) =>
      `${r.containerType}/${r.tripMode}/${r.customerId ? 'riêng' : 'chung'}`;
    expect(rows.map(key).sort()).toEqual([
      '20DC/SINGLE/chung',
      '20DC/TWIN_20/chung',
      '40HC/SINGLE/chung',
      '40HC/SINGLE/riêng',
    ]);
  });

  it('phí nâng hạ áp mọi tuyến (routeId NULL) và có một dòng miễn phí', async () => {
    const rows = await repoOf(SEED_TENANTS.phucAn.id).fees.list();
    const lift = rows.filter((r) => r.feeCode === 'LIFT_FEE');
    expect(lift.every((r) => r.routeId === null)).toBe(true);
    expect(lift.some((r) => r.isExcluded)).toBe(true);
    const norms = rows.filter((r) => r.feeCategory === 'COST_NORM').map((r) => r.feeCode);
    expect(norms.sort()).toEqual(['DRIVER_SALARY', 'DRIVER_SALARY', 'TOLL_FEE', 'TOLL_FEE']);
  });
});
