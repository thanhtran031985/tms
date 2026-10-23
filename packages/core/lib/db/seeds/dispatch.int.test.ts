import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDispatchRepo } from '../../../modules/dispatch/repo';
import { createOrderRepo } from '../../../modules/orders/repo';
import { startTestInfra, type TestInfra } from '../../../test/containers';
import { nextNumber } from '../numbering';
import { getTenantDb } from '../tenant-db';
import {
  SEED_BOARD_EXPORT_ORDER_ID,
  SEED_BOARD_IMPORT_CONTAINER,
  SEED_DISPATCH_CONTAINER_ID,
  SEED_TRIP_SEQ_KEY,
} from './dispatch.test-data';
import { seedDispatch } from './dispatch';
import { seedFleet } from './fleet';
import { seedIdentity } from './identity';
import { SEED_TENANTS } from './identity.test-data';
import { seedMasterData } from './master-data';
import { seedOrders } from './orders';
import { seedTariffs } from './tariffs';

describe('seed chuyến điều vận', () => {
  let infra: TestInfra;

  beforeAll(async () => {
    infra = await startTestInfra({ redis: false });
    await seedIdentity(infra.db, { password: 'mat-khau-thu-nghiem' });
    await seedMasterData(infra.db);
    await seedFleet(infra.db);
    await seedTariffs(infra.db);
    await seedOrders(infra.db);
    await seedDispatch(infra.db);
    await seedDispatch(infra.db); // chạy lại lần hai không sinh trùng
  });

  afterAll(async () => {
    await infra?.stop();
  });

  const tdbOf = (tenantId: string) => getTenantDb({ tenantId }, { db: infra.db });
  const dispatchA = () => createDispatchRepo(tdbOf(SEED_TENANTS.phucAn.id));
  const dispatchB = () => createDispatchRepo(tdbOf(SEED_TENANTS.saoViet.id));

  it('chạy hai lần không sinh bản ghi trùng, tenant Sao Việt không có chuyến', async () => {
    expect(await dispatchA().trips.list()).toHaveLength(1);
    expect(await dispatchA().tripContainers.list()).toHaveLength(1);
    expect(await dispatchA().assignments.list()).toHaveLength(3);
    expect(await dispatchB().trips.list()).toHaveLength(0);
    expect(await dispatchB().assignments.list()).toHaveLength(0);
  });

  it('chuyến buổi sáng gán 51C-482.17, rơ moóc 51R-112.23 và tài xế Phạm Quốc Huy cho 3 Stop của cont', async () => {
    const [trip] = await dispatchA().trips.list();
    const assignments = await dispatchA().assignments.list();

    expect(trip).toMatchObject({
      tripCode: 'TRIP-2610-001',
      tripMode: 'SINGLE',
      status: 'PLANNED',
      version: 0,
    });
    expect(trip!.primaryDriverId).toBeTruthy();
    expect(new Set(assignments.map((a) => a.stopId)).size).toBe(3);
    expect(new Set(assignments.map((a) => a.consolidatedTripId))).toEqual(new Set([trip!.id]));
    for (const a of assignments) {
      expect(a).toMatchObject({
        status: 'ASSIGNED',
        driverId: trip!.primaryDriverId,
        tractorId: trip!.primaryTractorId,
        trailerId: trip!.primaryTrailerId,
        plannedStart: trip!.plannedStart,
        plannedEnd: trip!.plannedEnd,
      });
    }
  });

  it('cont của chuyến ở trạng thái PLANNED, các cont khác vẫn PENDING', async () => {
    const containers = await createOrderRepo(tdbOf(SEED_TENANTS.phucAn.id)).containers.list();
    const planned = containers.filter((c) => c.status === 'PLANNED');

    expect(planned.map((c) => c.id)).toEqual([SEED_DISPATCH_CONTAINER_ID]);
  });

  it('cont mẫu có nhãn cho Kanban: DEM/DET, EDO, lệnh cấp rỗng', async () => {
    const containers = await createOrderRepo(tdbOf(SEED_TENANTS.phucAn.id)).containers.list();
    const imported = containers.find(
      (c) => c.containerNo === SEED_BOARD_IMPORT_CONTAINER.containerNo,
    )!;
    const exported = containers.filter((c) => c.orderId === SEED_BOARD_EXPORT_ORDER_ID);

    expect(imported).toMatchObject({
      portReadinessStatus: 'READY_EDO',
      demFreeUntil: SEED_BOARD_IMPORT_CONTAINER.demFreeUntil,
      detFreeUntil: SEED_BOARD_IMPORT_CONTAINER.detFreeUntil,
    });
    expect(exported).toHaveLength(2);
    expect(exported.every((c) => c.portReadinessStatus === 'READY_EMPTY_RELEASE')).toBe(true);
  });

  it('bộ đếm TRIP đi sau mã đã seed: chuyến tạo mới không trùng TRIP-2610-001', async () => {
    const tdb = tdbOf(SEED_TENANTS.phucAn.id);

    expect(await nextNumber(tdb, SEED_TRIP_SEQ_KEY)).toBe(2);
  });
});
