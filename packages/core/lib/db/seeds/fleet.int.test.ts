import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestInfra, type TestInfra } from '../../../test/containers';
import { createFleetRepo } from '../../../modules/fleet/repo';
import { listExpiringDocuments } from '../../../modules/fleet/documents.service';
import { getTenantDb } from '../tenant-db';
import { seedIdentity } from './identity';
import { SEED_TENANTS } from './identity.test-data';
import { seedFleet } from './fleet';

describe('seed đội xe, rơ moóc, tài xế', () => {
  let infra: TestInfra;

  beforeAll(async () => {
    infra = await startTestInfra({ redis: false });
    await seedIdentity(infra.db, { password: 'mat-khau-thu-nghiem' });
    await seedFleet(infra.db);
    await seedFleet(infra.db); // chạy lại lần hai không sinh trùng
  });

  afterAll(async () => {
    await infra?.stop();
  });

  const repoOf = (tenantId: string) =>
    createFleetRepo(getTenantDb({ tenantId }, { db: infra.db }));

  it('chạy hai lần không sinh bản ghi trùng', async () => {
    const a = repoOf(SEED_TENANTS.phucAn.id);
    expect(await a.tractors.list()).toHaveLength(4);
    expect(await a.trailers.list()).toHaveLength(4);
    expect(await a.drivers.list()).toHaveLength(4);

    const b = repoOf(SEED_TENANTS.saoViet.id);
    expect(await b.tractors.list()).toHaveLength(1);
    expect(await b.trailers.list()).toHaveLength(1);
    expect(await b.drivers.list()).toHaveLength(1);
  });

  it('có xe 51C-482.17 và 51C-228.40 với model và tải trọng đúng', async () => {
    const a = repoOf(SEED_TENANTS.phucAn.id);
    const t1 = await a.tractors.findByPlate('51C-482.17');
    expect(t1?.model).toBe('Hino 700');
    expect(t1?.fuelNormLitersPer100km).toBe('35.00');

    const t2 = await a.tractors.findByPlate('51C-228.40');
    expect(t2?.model).toBe('Hyundai Xcient');
  });

  it('rơ moóc 51R-556.78 là 40FT_COMBO có canCarryTwin20 và hasGensetPower', async () => {
    const a = repoOf(SEED_TENANTS.phucAn.id);
    const tr = await a.trailers.findByPlate('51R-556.78');
    expect(tr?.trailerType).toBe('40FT_COMBO');
    expect(tr?.canCarryTwin20).toBe(true);
    expect(tr?.hasGensetPower).toBe(true);
  });

  it('listExpiringDocuments phát hiện đúng giấy tờ sắp hết hạn và đã hết hạn từ dữ liệu seed', async () => {
    const ctx = {
      tenantId: SEED_TENANTS.phucAn.id,
      userId: '00000000-0000-0000-0000-000000000001',
      role: 'FLEET_MANAGER' as const,
      timezone: 'Asia/Ho_Chi_Minh',
      requestId: 'req-seed-doc',
    };
    const tdb = getTenantDb(ctx, { db: infra.db });

    const items = await listExpiringDocuments(ctx, tdb, { withinDays: 15 });
    // Từ dữ liệu seed:
    // 1. 51C-228.40 registrationExpiry: rel(-5) (EXPIRED)
    // 2. 51C-228.40 insuranceExpiry: rel(10) (EXPIRING_SOON)
    // 3. 51C-991.12 registrationExpiry: rel(7) (EXPIRING_SOON)
    // 4. 51R-334.56 inspectionExpiry: rel(8) (EXPIRING_SOON)
    // 5. 51R-556.78 inspectionExpiry: rel(-2) (EXPIRED)
    // 6. Trần Văn Lộc licenseExpiry: rel(2) (EXPIRING_SOON)
    // 7. Nguyễn Hoàng Nam dgCertificateExpiry: rel(12) (EXPIRING_SOON)
    // 8. Lê Minh Tuấn licenseExpiry: rel(-3) (EXPIRED)
    expect(items.length).toBeGreaterThanOrEqual(8);

    const expiredItems = items.filter((i) => i.isExpired);
    expect(expiredItems.length).toBe(3); // 51C-228.40 đăng kiểm, 51R-556.78 kiểm định, Lê Minh Tuấn GPLX

    const soonItems = items.filter((i) => i.isExpiringSoon);
    expect(soonItems.length).toBe(5); // 51C-228.40 BH, 51C-991.12 ĐK, 51R-334.56 KĐ, Trần Văn Lộc GPLX, Nguyễn Hoàng Nam DG
  });
});
