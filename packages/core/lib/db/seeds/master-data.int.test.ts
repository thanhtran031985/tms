import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestInfra, type TestInfra } from '../../../test/containers';
import { createMasterDataRepo } from '../../../modules/master-data/repo';
import { getTenantDb } from '../tenant-db';
import { seedIdentity } from './identity';
import { SEED_TENANTS } from './identity.test-data';
import { seedMasterData } from './master-data';

describe('seed danh mục', () => {
  let infra: TestInfra;

  beforeAll(async () => {
    infra = await startTestInfra({ redis: false });
    await seedIdentity(infra.db, { password: 'mat-khau-thu-nghiem' });
    await seedMasterData(infra.db);
    await seedMasterData(infra.db); // chạy lại lần hai không sinh trùng
  });

  afterAll(async () => {
    await infra?.stop();
  });

  const repoOf = (tenantId: string) =>
    createMasterDataRepo(getTenantDb({ tenantId }, { db: infra.db }));

  it('chạy hai lần không sinh bản ghi trùng', async () => {
    const a = repoOf(SEED_TENANTS.phucAn.id);
    expect(await a.customers.list()).toHaveLength(4);
    expect(await a.shippingLines.list()).toHaveLength(4);
    expect(await a.vendors.list()).toHaveLength(3);
    expect(await a.locations.list()).toHaveLength(9);
    expect(await a.routes.list()).toHaveLength(3);
  });

  it('có tuyến Cát Lái – Sóng Thần và cảng Cát Lái có tọa độ, bán kính geofence', async () => {
    const a = repoOf(SEED_TENANTS.phucAn.id);
    const route = await a.routes.findByCode('CL-ST');
    expect(route?.name).toBe('Cát Lái – Sóng Thần');
    expect(route?.standardDistanceKm).toBe(28);

    const port = await a.locations.findByCode('CATLAI');
    expect(port?.type).toBe('PORT');
    expect(Number(port?.lat)).toBeGreaterThan(10);
    expect(port?.geofenceRadiusM).toBeGreaterThan(0);
  });

  it('hai công ty dùng chung mã THEPNL nhưng là hai khách khác nhau', async () => {
    const a = await repoOf(SEED_TENANTS.phucAn.id).customers.findByCode('THEPNL');
    const b = await repoOf(SEED_TENANTS.saoViet.id).customers.findByCode('THEPNL');
    expect(a?.id).not.toBe(b?.id);
    expect(a?.name).not.toBe(b?.name);
  });

  it('kho khách gắn đúng khách cùng công ty', async () => {
    const a = repoOf(SEED_TENANTS.phucAn.id);
    const warehouse = await a.locations.findByCode('KHO-PT');
    const owner = await a.customers.get(warehouse!.customerId!);
    expect(owner?.code).toBe('PHUCTHINH');
  });
});
