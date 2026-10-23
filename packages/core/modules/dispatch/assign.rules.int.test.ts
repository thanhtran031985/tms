// Test quy tắc của assignResources và dispatchTrip (TICKET-06, spec 03 mục 1, 2, 4).
import type { AssignmentStatus } from '@shared/enums';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listAuditForEntity } from '../../lib/audit/repo';
import {
  A,
  B,
  admin,
  at,
  createWorld,
  dispatcher,
  dispatcherB,
  expectAppError,
  NOW,
  viewer,
  type World,
} from './dispatch.test-world';
import { createDispatchService } from './index';

const WINDOW = { start: at('01:00'), end: at('05:00') };

describe('assignResources: quy tắc', () => {
  let w: World;

  beforeAll(async () => {
    w = await createWorld();
  });

  afterAll(async () => {
    await w?.stop();
  });

  /** Assignment có sẵn của tài nguyên, để dựng tình huống chồng lấn. */
  async function busy(
    resource: { driverId?: string; tractorId?: string; trailerId?: string },
    window: { start: Date; end: Date },
    status: AssignmentStatus = 'ASSIGNED',
  ) {
    const other = await w.newTrip(window);
    const stopId = (await w.orders().stops.list()).find(
      (s) => s.orderContainerId === other.containerId,
    )!.id;
    await w.repo().assignments.insert({
      consolidatedTripId: other.trip.id,
      stopId,
      ...resource,
      plannedStart: window.start,
      plannedEnd: window.end,
      dispatchedAt: NOW,
      status,
    });
    return other;
  }

  describe('kết quả gán', () => {
    it('ghi 1 assignment cho mỗi Stop, đồng bộ primary*, tăng version và ghi audit', async () => {
      const r = await w.newResources();
      const { trip, containerId } = await w.newTrip(WINDOW);

      const result = await w.assign(dispatcher, trip.id, r.ids);

      const stops = (await w.orders().stops.list()).filter(
        (s) => s.orderContainerId === containerId,
      );
      expect(result.assignments).toHaveLength(3);
      expect(new Set(result.assignments.map((a) => a.stopId))).toEqual(
        new Set(stops.map((s) => s.id)),
      );
      for (const a of result.assignments) {
        expect(a).toMatchObject({
          consolidatedTripId: trip.id,
          driverId: r.driver.id,
          tractorId: r.tractor.id,
          trailerId: r.trailer.id,
          status: 'ASSIGNED',
          assignmentType: 'INTERNAL_FLEET',
          plannedStart: WINDOW.start,
          plannedEnd: WINDOW.end,
        });
        expect(a.dispatchedAt).toEqual(NOW);
      }
      expect(result.trip).toMatchObject({
        primaryDriverId: r.driver.id,
        primaryTractorId: r.tractor.id,
        primaryTrailerId: r.trailer.id,
        version: trip.version + 1,
        status: 'PLANNED',
      });
      const audit = await listAuditForEntity(w.tdb(A), 'consolidated_trips', trip.id);
      expect(audit.map((e) => e.action)).toContain('ASSIGN');
    });

    it('không đổi status của tài xế và đầu kéo khi lên kế hoạch', async () => {
      const r = await w.newResources();
      const { trip } = await w.newTrip(WINDOW);

      await w.assign(dispatcher, trip.id, r.ids);

      expect((await w.fleet().drivers.get(r.driver.id))?.status).toBe('AVAILABLE');
      expect((await w.fleet().tractors.get(r.tractor.id))?.status).toBe('AVAILABLE');
      expect((await w.fleet().trailers.get(r.trailer.id))?.status).toBe('AVAILABLE');
    });

    it('gán lại cho chuyến đã có assignment: bản cũ CANCELLED, bản mới thay thế, không tự chồng lấn', async () => {
      const first = await w.newResources();
      const second = await w.newResources();
      const { trip } = await w.newTrip(WINDOW);
      await w.assign(dispatcher, trip.id, first.ids);

      await w.assign(dispatcher, trip.id, second.ids);
      await w.assign(dispatcher, trip.id, second.ids); // cùng tài nguyên với bản đang có của chính chuyến này

      const rows = (await w.repo().assignments.list()).filter(
        (a) => a.consolidatedTripId === trip.id,
      );
      expect(rows.filter((a) => a.status === 'ASSIGNED')).toHaveLength(3);
      expect(
        rows.filter((a) => a.status === 'ASSIGNED').every((a) => a.driverId === second.driver.id),
      ).toBe(true);
      expect(rows.filter((a) => a.status === 'CANCELLED').length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('quyền và dữ liệu', () => {
    it('VIEWER bị FORBIDDEN', async () => {
      const r = await w.newResources();
      const { trip } = await w.newTrip(WINDOW);

      await expectAppError(w.assign(viewer, trip.id, r.ids), 'FORBIDDEN');
    });

    it('version cũ trả STALE_DATA và không ghi gì', async () => {
      const r = await w.newResources();
      const { trip } = await w.newTrip(WINDOW);

      await expectAppError(
        w.service.assignResources(dispatcher, {
          tripId: trip.id,
          version: trip.version + 5,
          ...r.ids,
        }),
        'STALE_DATA',
      );
      expect(
        (await w.repo().assignments.list()).filter((a) => a.consolidatedTripId === trip.id),
      ).toEqual([]);
    });

    it('tenant khác không thấy chuyến: NOT_FOUND', async () => {
      const r = await w.newResources();
      const { trip } = await w.newTrip(WINDOW);

      await expectAppError(
        w.service.assignResources(dispatcherB, {
          tripId: trip.id,
          version: trip.version,
          ...r.ids,
        }),
        'NOT_FOUND',
      );
    });
  });

  describe('tài nguyên tồn tại, cùng tenant, còn hoạt động', () => {
    it('tài xế của tenant khác bị chặn (DRIVER_NOT_AVAILABLE)', async () => {
      const r = await w.newResources();
      const otherTenantDriver = await w.newDriver(B);
      const { trip } = await w.newTrip(WINDOW);

      await expectAppError(
        w.assign(dispatcher, trip.id, { ...r.ids, driverId: otherTenantDriver.id }),
        'DRIVER_NOT_AVAILABLE',
      );
    });

    it('id không tồn tại bị chặn như không điều được', async () => {
      const r = await w.newResources();
      const { trip } = await w.newTrip(WINDOW);

      await expectAppError(
        w.assign(dispatcher, trip.id, { ...r.ids, tractorId: randomUUID() }),
        'TRACTOR_NOT_AVAILABLE',
      );
      await expectAppError(
        w.assign(dispatcher, trip.id, { ...r.ids, trailerId: randomUUID() }),
        'TRAILER_NOT_AVAILABLE',
      );
    });

    it('INACTIVE bị chặn cho cả ba loại tài nguyên', async () => {
      const r = await w.newResources();
      const { trip } = await w.newTrip(WINDOW);
      const inactiveDriver = await w.newDriver(A, { status: 'INACTIVE' });
      const inactiveTractor = await w.newTractor(A, { status: 'INACTIVE' });
      const inactiveTrailer = await w.newTrailer(A, { status: 'INACTIVE' });

      await expectAppError(
        w.assign(dispatcher, trip.id, { ...r.ids, driverId: inactiveDriver.id }),
        'DRIVER_NOT_AVAILABLE',
      );
      await expectAppError(
        w.assign(dispatcher, trip.id, { ...r.ids, tractorId: inactiveTractor.id }),
        'TRACTOR_NOT_AVAILABLE',
      );
      await expectAppError(
        w.assign(dispatcher, trip.id, { ...r.ids, trailerId: inactiveTrailer.id }),
        'TRAILER_NOT_AVAILABLE',
      );
    });

    it('đã xóa mềm bị chặn', async () => {
      const r = await w.newResources();
      const { trip } = await w.newTrip(WINDOW);
      const deleted = await w.newTrailer();
      await w.fleet().trailers.setDeleted(deleted.id, new Date());

      await expectAppError(
        w.assign(dispatcher, trip.id, { ...r.ids, trailerId: deleted.id }),
        'TRAILER_NOT_AVAILABLE',
      );
    });
  });

  describe('chồng lấn thời gian', () => {
    it('chồng với assignment ASSIGNED, IN_TRANSIT, RESCUE_ASSIGNED bị RESOURCE_TIME_CONFLICT', async () => {
      for (const status of ['ASSIGNED', 'IN_TRANSIT', 'RESCUE_ASSIGNED'] as const) {
        const r = await w.newResources();
        await busy({ driverId: r.driver.id }, { start: at('03:00'), end: at('07:00') }, status);
        const { trip } = await w.newTrip(WINDOW);

        const error = await expectAppError(
          w.assign(dispatcher, trip.id, r.ids),
          'RESOURCE_TIME_CONFLICT',
        );
        expect(error.details).toMatchObject({ resource: 'DRIVER' });
      }
    });

    it('chồng với assignment CANCELLED, COMPLETED, ABORTED_MIDWAY không tính', async () => {
      for (const status of ['CANCELLED', 'COMPLETED', 'ABORTED_MIDWAY'] as const) {
        const r = await w.newResources();
        await busy(
          { driverId: r.driver.id, tractorId: r.tractor.id, trailerId: r.trailer.id },
          { start: at('03:00'), end: at('07:00') },
          status,
        );
        const { trip } = await w.newTrip(WINDOW);

        await expect(w.assign(dispatcher, trip.id, r.ids), status).resolves.toBeDefined();
      }
    });

    it('đầu kéo và rơ moóc cũng được kiểm tra chồng lấn riêng', async () => {
      const r = await w.newResources();
      await busy({ tractorId: r.tractor.id }, { start: at('04:00'), end: at('08:00') });
      const r2 = await w.newResources();
      await busy({ trailerId: r2.trailer.id }, { start: at('00:00'), end: at('02:00') });
      const t1 = await w.newTrip(WINDOW);
      const t2 = await w.newTrip(WINDOW);

      const e1 = await expectAppError(
        w.assign(dispatcher, t1.trip.id, r.ids),
        'RESOURCE_TIME_CONFLICT',
      );
      const e2 = await expectAppError(
        w.assign(dispatcher, t2.trip.id, r2.ids),
        'RESOURCE_TIME_CONFLICT',
      );
      expect(e1.details).toMatchObject({ resource: 'TRACTOR' });
      expect(e2.details).toMatchObject({ resource: 'TRAILER' });
    });

    it('chuyến nối tiếp sát giờ (kết thúc đúng lúc chuyến sau bắt đầu) không chồng lấn', async () => {
      const r = await w.newResources();
      await busy(r.ids, { start: at('05:00'), end: at('09:00') });
      const { trip } = await w.newTrip(WINDOW);

      await expect(w.assign(dispatcher, trip.id, r.ids)).resolves.toBeDefined();
    });
  });

  describe('bảo dưỡng', () => {
    it('lệnh bảo dưỡng PLANNED chồng giờ chặn đầu kéo và rơ moóc (details.reason = MAINTENANCE)', async () => {
      const r = await w.newResources();
      await w.fleet().maintenanceOrders.insert({
        tractorId: r.tractor.id,
        type: 'SCHEDULED',
        plannedStart: at('04:00'),
        plannedEnd: at('08:00'),
        status: 'PLANNED',
      });
      const r2 = await w.newResources();
      await w.fleet().maintenanceOrders.insert({
        trailerId: r2.trailer.id,
        type: 'TIRE',
        plannedStart: at('00:00'),
        plannedEnd: at('02:00'),
        status: 'IN_PROGRESS',
      });
      const t1 = await w.newTrip(WINDOW);
      const t2 = await w.newTrip(WINDOW);

      const e1 = await expectAppError(
        w.assign(dispatcher, t1.trip.id, r.ids),
        'TRACTOR_NOT_AVAILABLE',
      );
      const e2 = await expectAppError(
        w.assign(dispatcher, t2.trip.id, r2.ids),
        'TRAILER_NOT_AVAILABLE',
      );
      expect(e1.details).toMatchObject({ reason: 'MAINTENANCE' });
      expect(e2.details).toMatchObject({ reason: 'MAINTENANCE' });
    });

    it('lệnh bảo dưỡng DONE hoặc CANCELLED không chặn', async () => {
      const r = await w.newResources();
      for (const status of ['DONE', 'CANCELLED'] as const) {
        await w.fleet().maintenanceOrders.insert({
          tractorId: r.tractor.id,
          type: 'SCHEDULED',
          plannedStart: at('00:00'),
          plannedEnd: at('08:00'),
          status,
        });
      }
      const { trip } = await w.newTrip(WINDOW);

      await expect(w.assign(dispatcher, trip.id, r.ids)).resolves.toBeDefined();
    });
  });

  describe('trạng thái khi chuyến sắp bắt đầu', () => {
    const SOON = { start: at('05:20', '2026-10-22'), end: at('09:00', '2026-10-22') }; // 20 phút sau NOW

    it('chuyến bắt đầu sau 20 phút: tài xế OFF_DUTY bị chặn', async () => {
      const r = await w.newResources();
      await w.fleet().drivers.update(r.driver.id, { status: 'OFF_DUTY' });
      const { trip } = await w.newTrip(SOON);

      await expectAppError(w.assign(dispatcher, trip.id, r.ids), 'DRIVER_NOT_AVAILABLE');
    });

    it('chuyến bắt đầu sau 20 phút: đầu kéo hoặc rơ moóc không AVAILABLE bị chặn', async () => {
      const busyTractor = await w.newResources();
      await w.fleet().tractors.update(busyTractor.tractor.id, { status: 'IN_USE' });
      const busyTrailer = await w.newResources();
      await w.fleet().trailers.update(busyTrailer.trailer.id, { status: 'DROPPED' });
      const t1 = await w.newTrip(SOON);
      const t2 = await w.newTrip(SOON);

      await expectAppError(
        w.assign(dispatcher, t1.trip.id, busyTractor.ids),
        'TRACTOR_NOT_AVAILABLE',
      );
      await expectAppError(
        w.assign(dispatcher, t2.trip.id, busyTrailer.ids),
        'TRAILER_NOT_AVAILABLE',
      );
    });

    it('chuyến xa hơn 30 phút: xe đang IN_USE vì chuyến khác vẫn xếp được, chỉ xét chồng lấn', async () => {
      const r = await w.newResources();
      await w.fleet().tractors.update(r.tractor.id, { status: 'IN_USE' });
      await w.fleet().trailers.update(r.trailer.id, { status: 'DROPPED' });
      const { trip } = await w.newTrip(WINDOW);

      await expect(w.assign(dispatcher, trip.id, r.ids)).resolves.toBeDefined();
    });

    it('tài xế OFF_DUTY (nghỉ phép) luôn bị chặn, kể cả chuyến xa', async () => {
      const r = await w.newResources();
      await w.fleet().drivers.update(r.driver.id, { status: 'OFF_DUTY' });
      const { trip } = await w.newTrip(WINDOW);

      await expectAppError(w.assign(dispatcher, trip.id, r.ids), 'DRIVER_NOT_AVAILABLE');
    });
  });

  describe('giấy tờ', () => {
    it('GPLX hết hạn trước giờ kết thúc chuyến: DOCUMENT_EXPIRED', async () => {
      const driver = await w.newDriver(A, { licenseExpiry: '2026-10-25' });
      const r = await w.newResources();
      const { trip } = await w.newTrip(WINDOW);

      const error = await expectAppError(
        w.assign(dispatcher, trip.id, { ...r.ids, driverId: driver.id }),
        'DOCUMENT_EXPIRED',
      );
      expect(error.details).toMatchObject({ resource: 'DRIVER' });
    });

    it('giấy tờ hết hạn đúng ngày chuyến kết thúc vẫn còn hạn trong ngày đó', async () => {
      const driver = await w.newDriver(A, { licenseExpiry: '2026-10-26' });
      const r = await w.newResources();
      const { trip } = await w.newTrip(WINDOW);

      await expect(
        w.assign(dispatcher, trip.id, { ...r.ids, driverId: driver.id }),
      ).resolves.toBeDefined();
    });

    it('đăng kiểm, bảo hiểm, phù hiệu đầu kéo và kiểm định rơ moóc hết hạn đều bị chặn', async () => {
      const r = await w.newResources();
      const cases = [
        { tractorOverrides: { registrationExpiry: '2026-10-01' }, resource: 'TRACTOR' },
        { tractorOverrides: { insuranceExpiry: '2026-10-01' }, resource: 'TRACTOR' },
        { tractorOverrides: { transportBadgeExpiry: '2026-10-01' }, resource: 'TRACTOR' },
        { trailerOverrides: { inspectionExpiry: '2026-10-01' }, resource: 'TRAILER' },
      ] as const;
      for (const c of cases) {
        const tractor = await w.newTractor(A, 'tractorOverrides' in c ? c.tractorOverrides : {});
        const trailer = await w.newTrailer(A, 'trailerOverrides' in c ? c.trailerOverrides : {});
        const { trip } = await w.newTrip(WINDOW);

        const error = await expectAppError(
          w.assign(dispatcher, trip.id, {
            driverId: r.driver.id,
            tractorId: tractor.id,
            trailerId: trailer.id,
          }),
          'DOCUMENT_EXPIRED',
        );
        expect(error.details).toMatchObject({ resource: c.resource });
      }
    });

    it('GPLX còn 10 ngày sau giờ kết thúc: gán được kèm cảnh báo', async () => {
      const driver = await w.newDriver(A, { licenseExpiry: '2026-11-05' });
      const r = await w.newResources();
      const { trip } = await w.newTrip(WINDOW);

      const result = await w.assign(dispatcher, trip.id, { ...r.ids, driverId: driver.id });

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'DOCUMENT_EXPIRING',
          resource: 'DRIVER',
          severity: 'warn',
        }),
      );
    });
  });

  describe('giờ lái trong ngày', () => {
    /** Tài xế đã có chuyến 6 giờ sáng (08:00 đến 14:00 giờ Việt Nam) cùng ngày 26/10. */
    async function driverWithSixHours() {
      const driver = await w.newDriver();
      const other = await w.newResources();
      const { trip } = await w.newTrip({ start: at('01:00'), end: at('07:00') });
      await w.assign(dispatcher, trip.id, { ...other.ids, driverId: driver.id });
      return driver;
    }
    const AFTERNOON = { start: at('08:00'), end: at('13:00') }; // 5 giờ nữa: tổng 11 giờ

    it('tổng vượt 10 giờ: DRIVING_HOURS_EXCEEDED', async () => {
      const driver = await driverWithSixHours();
      const r = await w.newResources();
      const { trip } = await w.newTrip(AFTERNOON);

      const error = await expectAppError(
        w.assign(dispatcher, trip.id, { ...r.ids, driverId: driver.id }),
        'DRIVING_HOURS_EXCEEDED',
      );
      expect(error.details).toMatchObject({ plannedHours: 11, limitHours: 10 });
    });

    it('tổng đúng 10 giờ vẫn được', async () => {
      const driver = await driverWithSixHours();
      const r = await w.newResources();
      const { trip } = await w.newTrip({ start: at('08:00'), end: at('12:00') });

      await expect(
        w.assign(dispatcher, trip.id, { ...r.ids, driverId: driver.id }),
      ).resolves.toBeDefined();
    });

    it('DISPATCHER gửi ghi đè bị từ chối: DRIVING_HOURS_OVERRIDE_FORBIDDEN', async () => {
      const driver = await driverWithSixHours();
      const r = await w.newResources();
      const { trip } = await w.newTrip(AFTERNOON);

      await expectAppError(
        w.assign(
          dispatcher,
          trip.id,
          { ...r.ids, driverId: driver.id },
          { overrideDrivingHours: { reason: 'Khách gấp' } },
        ),
        'DRIVING_HOURS_OVERRIDE_FORBIDDEN',
      );
    });

    it('ADMIN ghi đè kèm lý do thì gán được và audit ghi lý do', async () => {
      const driver = await driverWithSixHours();
      const r = await w.newResources();
      const { trip } = await w.newTrip(AFTERNOON);

      const result = await w.assign(
        admin,
        trip.id,
        { ...r.ids, driverId: driver.id },
        { overrideDrivingHours: { reason: 'Khách gấp, tài xế đồng ý chạy thêm' } },
      );

      expect(result.warnings).toContainEqual(
        expect.objectContaining({ code: 'DRIVING_HOURS_OVERRIDDEN' }),
      );
      const audit = await listAuditForEntity(w.tdb(A), 'consolidated_trips', trip.id);
      expect(JSON.stringify(audit)).toContain('Khách gấp, tài xế đồng ý chạy thêm');
    });

    it('giới hạn giờ lái lấy từ tenants.settings của tenant', async () => {
      const strict = createDispatchService({
        tenantDb: (ctx) => w.tdb(ctx.tenantId),
        now: () => NOW,
        loadSettings: async () => ({ dispatch: { maxDrivingHoursPerDay: 3 } }),
      });
      const r = await w.newResources();
      const { trip } = await w.newTrip(WINDOW); // 4 giờ

      const error = await expectAppError(
        strict.assignResources(dispatcher, { tripId: trip.id, version: trip.version, ...r.ids }),
        'DRIVING_HOURS_EXCEEDED',
      );
      expect(error.details).toMatchObject({ limitHours: 3, plannedHours: 4 });
    });

    it('settings sai kiểu thì rơi về mặc định 10 giờ', async () => {
      const lenient = createDispatchService({
        tenantDb: (ctx) => w.tdb(ctx.tenantId),
        now: () => NOW,
        loadSettings: async () => ({ dispatch: { maxDrivingHoursPerDay: 'nhiều' } }),
      });
      const r = await w.newResources();
      const { trip } = await w.newTrip(WINDOW);

      await expect(
        lenient.assignResources(dispatcher, { tripId: trip.id, version: trip.version, ...r.ids }),
      ).resolves.toBeDefined();
    });

    it('ADMIN gửi ghi đè khi không vượt giờ: bỏ qua, không ghi lý do', async () => {
      const r = await w.newResources();
      const { trip } = await w.newTrip(WINDOW);

      const result = await w.assign(admin, trip.id, r.ids, {
        overrideDrivingHours: { reason: 'Không cần' },
      });

      expect(result.warnings.map((x) => x.code)).not.toContain('DRIVING_HOURS_OVERRIDDEN');
    });
  });

  describe('ràng buộc vật lý một container', () => {
    it('cont lạnh 40RF với rơ moóc không genset: REEFER_REQUIRES_GENSET; có genset thì được', async () => {
      const r = await w.newResources();
      const withGenset = await w.newTrailer(A, { hasGensetPower: true });
      const { trip } = await w.newTrip(WINDOW, { containerType: '40RF' });

      await expectAppError(w.assign(dispatcher, trip.id, r.ids), 'REEFER_REQUIRES_GENSET');
      await expect(
        w.assign(dispatcher, trip.id, { ...r.ids, trailerId: withGenset.id }),
      ).resolves.toBeDefined();
    });

    it('hàng nguy hiểm: tài xế không chứng chỉ hoặc chứng chỉ hết hạn bị DG_CERTIFICATE_REQUIRED', async () => {
      const noCert = await w.newDriver();
      const expiredCert = await w.newDriver(A, {
        dgCertificateNo: 'DG-1',
        dgCertificateExpiry: '2026-10-01',
      });
      const validCert = await w.newDriver(A, {
        dgCertificateNo: 'DG-2',
        dgCertificateExpiry: '2030-01-01',
      });
      const r = await w.newResources();
      const { trip } = await w.newTrip(WINDOW, { isDangerousGoods: true });

      await expectAppError(
        w.assign(dispatcher, trip.id, { ...r.ids, driverId: noCert.id }),
        'DG_CERTIFICATE_REQUIRED',
      );
      await expectAppError(
        w.assign(dispatcher, trip.id, { ...r.ids, driverId: expiredCert.id }),
        'DG_CERTIFICATE_REQUIRED',
      );
      await expect(
        w.assign(dispatcher, trip.id, { ...r.ids, driverId: validCert.id }),
      ).resolves.toBeDefined();
    });

    it('thiếu khối lượng: WEIGHT_CONFIRMATION_REQUIRED; xác nhận thì gán được kèm cảnh báo', async () => {
      const r = await w.newResources();
      const { trip } = await w.newTrip(WINDOW, { cargoWeightTons: null, vgmTons: null });

      await expectAppError(w.assign(dispatcher, trip.id, r.ids), 'WEIGHT_CONFIRMATION_REQUIRED');
      const result = await w.assign(dispatcher, trip.id, r.ids, { confirmMissingWeight: true });

      expect(result.warnings).toContainEqual(
        expect.objectContaining({ code: 'WEIGHT_MISSING', resource: 'CONTAINER' }),
      );
    });

    it('khối lượng vượt tải trọng rơ moóc: PAYLOAD_EXCEEDED (VGM ưu tiên hơn khối lượng hàng)', async () => {
      const r = await w.newResources(); // rơ moóc tải tối đa 28 t
      const over = await w.newTrip(WINDOW, { vgmTons: '29.00', cargoWeightTons: '5.00' });
      const underByVgm = await w.newTrip(WINDOW, { vgmTons: '20.00', cargoWeightTons: '30.00' });

      await expectAppError(w.assign(dispatcher, over.trip.id, r.ids), 'PAYLOAD_EXCEEDED');
      await expect(w.assign(dispatcher, underByVgm.trip.id, r.ids)).resolves.toBeDefined();
    });

    it('khối lượng hàng cộng vỏ cont chuẩn được dùng khi chưa có VGM', async () => {
      const r = await w.newResources();
      // 40HC: vỏ chuẩn 3,8 t; 25 t hàng + 3,8 = 28,8 t vượt tải trọng 28 t.
      const { trip } = await w.newTrip(WINDOW, { cargoWeightTons: '25.00', vgmTons: null });

      await expectAppError(w.assign(dispatcher, trip.id, r.ids), 'PAYLOAD_EXCEEDED');
    });

    it('cont cộng tự trọng rơ moóc vượt khối lượng cho phép của đầu kéo: PAYLOAD_EXCEEDED', async () => {
      const tractor = await w.newTractor(A, { permittedGrossWeightTons: '30.00' });
      const r = await w.newResources();
      // 27 + rơ moóc 4 = 31 t > 30 t, dù 27 t chưa vượt tải trọng 28 t của rơ moóc.
      const { trip } = await w.newTrip(WINDOW, { vgmTons: '27.00' });

      await expectAppError(
        w.assign(dispatcher, trip.id, { ...r.ids, tractorId: tractor.id }),
        'PAYLOAD_EXCEEDED',
      );
    });

    it('cảnh báo thông tin: đã bỏ tự trọng đầu kéo khỏi phép tính', async () => {
      const r = await w.newResources();
      const { trip } = await w.newTrip(WINDOW);

      const result = await w.assign(dispatcher, trip.id, r.ids);

      expect(result.warnings).toContainEqual(
        expect.objectContaining({ code: 'TRACTOR_TARE_NOT_COUNTED', severity: 'info' }),
      );
    });

    it('hàng Xuất: PORT_IN kết thúc sau cut-off thì cảnh báo đỏ nhưng vẫn gán được', async () => {
      const r1 = await w.newResources();
      const r2 = await w.newResources();
      // Order EXP-2610-046 có cut-off 31/10/2026 15:00 UTC.
      const late = await w.newTrip(
        { start: at('10:00', '2026-10-31'), end: at('16:00', '2026-10-31') },
        { kind: 'EXPORT' },
      );
      const early = await w.newTrip(
        { start: at('06:00', '2026-10-31'), end: at('12:00', '2026-10-31') },
        { kind: 'EXPORT' },
      );

      const lateResult = await w.assign(dispatcher, late.trip.id, r1.ids);
      const earlyResult = await w.assign(dispatcher, early.trip.id, r2.ids);

      expect(lateResult.warnings).toContainEqual(
        expect.objectContaining({ code: 'CUT_OFF_EXCEEDED', severity: 'danger' }),
      );
      expect(earlyResult.warnings.map((x) => x.code)).not.toContain('CUT_OFF_EXCEEDED');
    });
  });

  describe('dispatchTrip: chuyển PLANNED sang DISPATCHED', () => {
    it('chuyến chưa gán tài nguyên không điều được', async () => {
      const { trip } = await w.newTrip(WINDOW);

      await expectAppError(
        w.service.dispatchTrip(dispatcher, { tripId: trip.id, version: trip.version }),
        'VALIDATION_ERROR',
      );
    });

    it('cont HOLD_CUSTOMS hoặc HOLD_LINE bị PORT_NOT_READY; READY_EDO thì điều được', async () => {
      for (const [status, expected] of [
        ['HOLD_CUSTOMS', 'PORT_NOT_READY'],
        ['HOLD_LINE', 'PORT_NOT_READY'],
        ['PENDING', 'PORT_NOT_READY'],
        ['READY_EDO', undefined],
      ] as const) {
        const r = await w.newResources();
        const { trip, containerId } = await w.newTrip(WINDOW, { portReadinessStatus: status });
        // Cho lưu kế hoạch dù chưa sẵn sàng (Rule 7: chỉ chặn lúc điều).
        const planned = await w.assign(dispatcher, trip.id, r.ids);

        const dispatch = w.service.dispatchTrip(dispatcher, {
          tripId: trip.id,
          version: planned.trip.version,
        });

        if (expected) {
          await expectAppError(dispatch, expected);
          expect((await w.repo().trips.get(trip.id))?.status).toBe('PLANNED');
        } else {
          const result = await dispatch;
          expect(result.trip.status).toBe('DISPATCHED');
          expect((await w.orders().containers.get(containerId))?.status).toBe('PLANNED');
          expect(result.assignments.every((a) => a.status === 'ASSIGNED')).toBe(true);
        }
      }
    });

    it('hàng Xuất cần READY_EMPTY_RELEASE, READY_EDO không đủ', async () => {
      const r1 = await w.newResources();
      const r2 = await w.newResources();
      const wrong = await w.newTrip(WINDOW, { kind: 'EXPORT', portReadinessStatus: 'READY_EDO' });
      const right = await w.newTrip(WINDOW, {
        kind: 'EXPORT',
        portReadinessStatus: 'READY_EMPTY_RELEASE',
      });
      const p1 = await w.assign(dispatcher, wrong.trip.id, r1.ids);
      const p2 = await w.assign(dispatcher, right.trip.id, r2.ids);

      await expectAppError(
        w.service.dispatchTrip(dispatcher, { tripId: wrong.trip.id, version: p1.trip.version }),
        'PORT_NOT_READY',
      );
      await expect(
        w.service.dispatchTrip(dispatcher, { tripId: right.trip.id, version: p2.trip.version }),
      ).resolves.toBeDefined();
    });

    it('chuyến đã DISPATCHED không điều lần nữa (INVALID_STATUS_TRANSITION)', async () => {
      const r = await w.newResources();
      const { trip } = await w.newTrip(WINDOW);
      const planned = await w.assign(dispatcher, trip.id, r.ids);
      const dispatched = await w.service.dispatchTrip(dispatcher, {
        tripId: trip.id,
        version: planned.trip.version,
      });

      await expectAppError(
        w.service.dispatchTrip(dispatcher, { tripId: trip.id, version: dispatched.trip.version }),
        'INVALID_STATUS_TRANSITION',
      );
    });
  });
});
