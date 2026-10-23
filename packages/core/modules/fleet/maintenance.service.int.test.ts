import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppError } from '@shared/errors';
import { startTestInfra, type TestInfra } from '../../test/containers';
import { seedIdentity } from '../../lib/db/seeds/identity';
import { SEED_TENANTS } from '../../lib/db/seeds/identity.test-data';
import { getTenantDb } from '../../lib/db/tenant-db';
import type { RequestContext } from '../../lib/context';
import { createTractor, createTrailer, getTractor, getTrailer } from './fleet.service';
import {
  createMaintenanceOrder,
  createMaintenancePlan,
  findMaintenanceOverlap,
  listMaintenanceDue,
  updateMaintenanceOrderStatus,
} from './maintenance.service';

describe('maintenance.service (kế hoạch và lệnh bảo dưỡng)', () => {
  let infra: TestInfra;

  beforeAll(async () => {
    infra = await startTestInfra({ redis: false });
    await seedIdentity(infra.db, { password: 'test-password' });
  });

  afterAll(async () => {
    await infra?.stop();
  });

  const runId = Math.random().toString(36).slice(2, 6).toUpperCase();
  const tenantA = SEED_TENANTS.phucAn.id;
  const ctxA = (timezone = 'Asia/Ho_Chi_Minh'): RequestContext => ({
    tenantId: tenantA,
    userId: '00000000-0000-0000-0000-000000000001',
    role: 'FLEET_MANAGER',
    timezone,
    requestId: 'req-maint-test',
  });
  const tdbA = () => getTenantDb(ctxA(), { db: infra.db });
  const ctxB = (): RequestContext => ({ ...ctxA(), tenantId: SEED_TENANTS.saoViet.id });
  const tdbB = () => getTenantDb(ctxB(), { db: infra.db });

  it('lệnh bảo dưỡng PLANNED 8:00 đến 17:00 chồng với 16:00-18:00, không chồng với 17:00-19:00', async () => {
    const tractor = await createTractor(ctxA(), tdbA(), {
      plateNumber: `51C-MNT.${runId}1`,
      fuelNormLitersPer100km: '35.00',
    });

    const plannedStart = new Date('2026-10-22T08:00:00.000Z');
    const plannedEnd = new Date('2026-10-22T17:00:00.000Z');

    const order = await createMaintenanceOrder(ctxA(), tdbA(), {
      tractorId: tractor.id,
      type: 'SCHEDULED',
      plannedStart,
      plannedEnd,
      status: 'PLANNED',
    });

    // 1. Khoảng [16:00, 18:00] chồng lấn (plannedStart < 18:00 && plannedEnd > 16:00)
    const overlap1 = await findMaintenanceOverlap(ctxA(), tdbA(), {
      tractorId: tractor.id,
      start: new Date('2026-10-22T16:00:00.000Z'),
      end: new Date('2026-10-22T18:00:00.000Z'),
    });
    expect(overlap1.map((o) => o.id)).toContain(order.id);

    // 2. Khoảng [17:00, 19:00] KHÔNG chồng lấn (vì plannedEnd = 17:00 không > 17:00)
    const overlap2 = await findMaintenanceOverlap(ctxA(), tdbA(), {
      tractorId: tractor.id,
      start: new Date('2026-10-22T17:00:00.000Z'),
      end: new Date('2026-10-22T19:00:00.000Z'),
    });
    expect(overlap2.map((o) => o.id)).not.toContain(order.id);

    // 3. Khoảng [06:00, 08:00] KHÔNG chồng lấn
    const overlap3 = await findMaintenanceOverlap(ctxA(), tdbA(), {
      tractorId: tractor.id,
      start: new Date('2026-10-22T06:00:00.000Z'),
      end: new Date('2026-10-22T08:00:00.000Z'),
    });
    expect(overlap3.map((o) => o.id)).not.toContain(order.id);
  });

  it('lệnh DONE hoặc CANCELLED không tính chồng lấn', async () => {
    const tractor = await createTractor(ctxA(), tdbA(), {
      plateNumber: `51C-MNT.${runId}2`,
      fuelNormLitersPer100km: '35.00',
    });

    const order = await createMaintenanceOrder(ctxA(), tdbA(), {
      tractorId: tractor.id,
      type: 'SCHEDULED',
      plannedStart: new Date('2026-10-22T08:00:00.000Z'),
      plannedEnd: new Date('2026-10-22T17:00:00.000Z'),
      status: 'CANCELLED',
    });

    const overlaps = await findMaintenanceOverlap(ctxA(), tdbA(), {
      tractorId: tractor.id,
      start: new Date('2026-10-22T10:00:00.000Z'),
      end: new Date('2026-10-22T12:00:00.000Z'),
    });
    expect(overlaps.map((o) => o.id)).not.toContain(order.id);
  });

  it('chuyển lệnh sang IN_PROGRESS đổi xe sang MAINTENANCE, chuyển sang DONE trả xe về AVAILABLE', async () => {
    const tractor = await createTractor(ctxA(), tdbA(), {
      plateNumber: `51C-MNT.${runId}3`,
      fuelNormLitersPer100km: '35.00',
      status: 'AVAILABLE',
    });

    const order = await createMaintenanceOrder(ctxA(), tdbA(), {
      tractorId: tractor.id,
      type: 'BREAKDOWN',
      status: 'PLANNED',
    });

    // Chuyển sang IN_PROGRESS
    await updateMaintenanceOrderStatus(ctxA(), tdbA(), order.id, 'IN_PROGRESS');
    const tInProgress = await getTractor(ctxA(), tdbA(), tractor.id);
    expect(tInProgress?.status).toBe('MAINTENANCE');

    // Chuyển sang DONE
    await updateMaintenanceOrderStatus(ctxA(), tdbA(), order.id, 'DONE');
    const tDone = await getTractor(ctxA(), tdbA(), tractor.id);
    expect(tDone?.status).toBe('AVAILABLE');
  });

  it('xe đến kỳ bảo dưỡng theo km và theo ngày', async () => {
    // Xe có currentOdometer = 50000
    const tractor = await createTractor(ctxA(), tdbA(), {
      plateNumber: `51C-MNT.${runId}4`,
      fuelNormLitersPer100km: '35.00',
      currentOdometer: 50000,
    });

    // Kế hoạch 1: intervalKm = 10000, lastDoneOdometer = 38000 -> chạy được 12000km >= 10000 -> ĐẾN KỲ
    await createMaintenancePlan(ctxA(), tdbA(), {
      tractorId: tractor.id,
      taskCode: 'THAY_NHOT_50K',
      intervalKm: 10000,
      lastDoneOdometer: 38000,
    });

    // Kế hoạch 2: intervalDays = 90, lastDoneAt = 100 ngày trước -> ĐẾN KỲ THEO NGÀY
    const pastDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await createMaintenancePlan(ctxA(), tdbA(), {
      tractorId: tractor.id,
      taskCode: 'KIEM_TRA_DINH_KY_QUY',
      intervalDays: 90,
      lastDoneAt: pastDate,
    });

    // Kế hoạch 3: intervalKm = 20000, lastDoneOdometer = 45000 -> mới 5000km -> CHƯA ĐẾN KỲ
    await createMaintenancePlan(ctxA(), tdbA(), {
      tractorId: tractor.id,
      taskCode: 'THAY_LOC_GIO',
      intervalKm: 20000,
      lastDoneOdometer: 45000,
    });

    const dueList = await listMaintenanceDue(ctxA(), tdbA());
    const tractorDues = dueList.filter((d) => d.targetId === tractor.id);

    expect(tractorDues.length).toBe(2);
    expect(tractorDues.map((d) => d.taskCode)).toContain('THAY_NHOT_50K');
    expect(tractorDues.map((d) => d.taskCode)).toContain('KIEM_TRA_DINH_KY_QUY');
    expect(tractorDues.map((d) => d.taskCode)).not.toContain('THAY_LOC_GIO');
  });

  it('tìm chồng lấn theo đầu kéo HOẶC rơ moóc khi truyền cả hai', async () => {
    const tractor = await createTractor(ctxA(), tdbA(), {
      plateNumber: `51C-MNT.${runId}5`,
      fuelNormLitersPer100km: '35.00',
    });
    const trailer = await createTrailer(ctxA(), tdbA(), {
      plateNumber: `51R-MNT.${runId}5`,
      trailerType: '40FT',
      maxPayloadTons: '28.00',
    });
    const start = new Date('2026-10-23T08:00:00.000Z');
    const end = new Date('2026-10-23T17:00:00.000Z');
    const onTractor = await createMaintenanceOrder(ctxA(), tdbA(), {
      tractorId: tractor.id,
      type: 'SCHEDULED',
      plannedStart: start,
      plannedEnd: end,
    });
    const onTrailer = await createMaintenanceOrder(ctxA(), tdbA(), {
      trailerId: trailer.id,
      type: 'TIRE',
      plannedStart: start,
      plannedEnd: end,
    });

    const found = await findMaintenanceOverlap(ctxA(), tdbA(), {
      tractorId: tractor.id,
      trailerId: trailer.id,
      start: new Date('2026-10-23T10:00:00.000Z'),
      end: new Date('2026-10-23T12:00:00.000Z'),
    });
    expect(found.map((o) => o.id).sort()).toEqual([onTractor.id, onTrailer.id].sort());
  });

  it('tìm chồng lấn không truyền đầu kéo lẫn rơ moóc thì VALIDATION_ERROR', async () => {
    await expect(
      findMaintenanceOverlap(ctxA(), tdbA(), {
        start: new Date('2026-10-23T10:00:00.000Z'),
        end: new Date('2026-10-23T12:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('không tạo lệnh hay kế hoạch cho xe của tenant khác (NOT_FOUND)', async () => {
    const tractorB = await createTractor(ctxB(), tdbB(), {
      plateNumber: `51C-MNT.${runId}6`,
      fuelNormLitersPer100km: '35.00',
    });
    await expect(
      createMaintenanceOrder(ctxA(), tdbA(), { tractorId: tractorB.id, type: 'SCHEDULED' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      createMaintenancePlan(ctxA(), tdbA(), {
        tractorId: tractorB.id,
        taskCode: 'THAY_NHOT',
        intervalKm: 10000,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('hủy lệnh IN_PROGRESS trả xe về AVAILABLE, nhưng giữ MAINTENANCE nếu còn lệnh IN_PROGRESS khác', async () => {
    const tractor = await createTractor(ctxA(), tdbA(), {
      plateNumber: `51C-MNT.${runId}7`,
      fuelNormLitersPer100km: '35.00',
    });
    const first = await createMaintenanceOrder(ctxA(), tdbA(), {
      tractorId: tractor.id,
      type: 'SCHEDULED',
      status: 'IN_PROGRESS',
    });
    const second = await createMaintenanceOrder(ctxA(), tdbA(), {
      tractorId: tractor.id,
      type: 'TIRE',
      status: 'IN_PROGRESS',
    });

    await updateMaintenanceOrderStatus(ctxA(), tdbA(), first.id, 'CANCELLED');
    expect((await getTractor(ctxA(), tdbA(), tractor.id))?.status).toBe('MAINTENANCE');

    await updateMaintenanceOrderStatus(ctxA(), tdbA(), second.id, 'CANCELLED');
    expect((await getTractor(ctxA(), tdbA(), tractor.id))?.status).toBe('AVAILABLE');
  });

  it('lệnh đã DONE hoặc CANCELLED không đổi trạng thái được nữa (INVALID_STATUS_TRANSITION)', async () => {
    const trailer = await createTrailer(ctxA(), tdbA(), {
      plateNumber: `51R-MNT.${runId}8`,
      trailerType: '40FT',
      maxPayloadTons: '28.00',
    });
    const order = await createMaintenanceOrder(ctxA(), tdbA(), {
      trailerId: trailer.id,
      type: 'TIRE',
      status: 'PLANNED',
    });
    await updateMaintenanceOrderStatus(ctxA(), tdbA(), order.id, 'IN_PROGRESS');
    expect((await getTrailer(ctxA(), tdbA(), trailer.id))?.status).toBe('MAINTENANCE');
    await updateMaintenanceOrderStatus(ctxA(), tdbA(), order.id, 'DONE');
    expect((await getTrailer(ctxA(), tdbA(), trailer.id))?.status).toBe('AVAILABLE');

    const err = await updateMaintenanceOrderStatus(ctxA(), tdbA(), order.id, 'PLANNED').catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('INVALID_STATUS_TRANSITION');
  });
});
