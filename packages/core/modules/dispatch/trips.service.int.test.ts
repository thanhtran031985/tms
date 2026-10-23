// Test tạo chuyến SINGLE và sửa giờ chuyến (TICKET-06, bước 3).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listAuditForEntity } from '../../lib/audit/repo';
import { SEED_ROUTES } from '../../lib/db/seeds/master-data.test-data';
import {
  A,
  at,
  createWorld,
  dispatcher,
  dispatcherB,
  expectAppError,
  viewer,
  type World,
} from './dispatch.test-world';

const WINDOW = { plannedStart: at('01:00').toISOString(), plannedEnd: at('05:00').toISOString() };

describe('trips.service', () => {
  let w: World;

  beforeAll(async () => {
    w = await createWorld();
  });

  afterAll(async () => {
    await w?.stop();
  });

  /** Container PENDING của Order đã xác nhận, chưa có chuyến. */
  const pendingContainer = (options = {}) => w.newContainer({ status: 'PENDING', ...options });

  // Service nhận input đã qua zod: giờ là Date.
  const create = (ctx: typeof dispatcher, orderContainerId: string, extra = {}) =>
    w.service.createSingleTrip(ctx, {
      orderContainerId,
      plannedStart: new Date(WINDOW.plannedStart),
      plannedEnd: new Date(WINDOW.plannedEnd),
      ...extra,
    });

  describe('createSingleTrip', () => {
    it('tạo chuyến SINGLE: tripCode từ nextNumber, một dòng trip_containers, container sang PLANNED, có audit', async () => {
      const { container, order } = await pendingContainer();

      const { trip, assignments, warnings } = await create(dispatcher, container.id);

      expect(trip).toMatchObject({
        tripMode: 'SINGLE',
        status: 'PLANNED',
        version: 0,
        routeId: container.routeId,
        plannedStart: new Date(WINDOW.plannedStart),
        plannedEnd: new Date(WINDOW.plannedEnd),
        primaryDriverId: null,
        primaryTractorId: null,
        primaryTrailerId: null,
      });
      expect(trip.tripCode).toMatch(/^TRIP-2610-\d{3}$/);
      expect(assignments).toEqual([]);
      expect(warnings).toEqual([]);

      const links = await w.repo().tripContainers.list();
      expect(links.filter((l) => l.tripId === trip.id)).toEqual([
        expect.objectContaining({
          orderContainerId: container.id,
          orderId: order.id,
          isManualOverride: false,
        }),
      ]);
      expect((await w.orders().containers.get(container.id))?.status).toBe('PLANNED');

      const audit = await listAuditForEntity(w.tdb(A), 'consolidated_trips', trip.id);
      expect(audit.map((e) => e.action)).toContain('CREATE');
    });

    it('mã chuyến tăng dần theo tháng và không trùng', async () => {
      const first = await pendingContainer();
      const second = await pendingContainer();

      const t1 = await create(dispatcher, first.container.id);
      const t2 = await create(dispatcher, second.container.id);

      const serialOf = (code: string) => Number(code.split('-')[2]);
      expect(serialOf(t2.trip.tripCode)).toBe(serialOf(t1.trip.tripCode) + 1);
    });

    it('cho phép ghi đè tuyến của container', async () => {
      const { container } = await pendingContainer();
      const other = SEED_ROUTES.find((r) => r.tenantId === A && r.id !== container.routeId)!.id;

      const { trip } = await create(dispatcher, container.id, { routeId: other });

      expect(trip.routeId).toBe(other);
    });

    it('Order nháp hoặc đã hủy: ORDER_NOT_CONFIRMED', async () => {
      const draft = (await w.orders().orders.list()).find((o) => o.orderNo === 'EXP-2610-044')!;
      const [draftContainer] = (await w.orders().containers.list()).filter(
        (c) => c.orderId === draft.id,
      );
      const cancelled = (await w.orders().orders.list()).find((o) => o.orderNo === 'IMP-2610-029')!;
      const [cancelledContainer] = (await w.orders().containers.list()).filter(
        (c) => c.orderId === cancelled.id,
      );

      await expectAppError(create(dispatcher, draftContainer!.id), 'ORDER_NOT_CONFIRMED');
      await expectAppError(create(dispatcher, cancelledContainer!.id), 'ORDER_NOT_CONFIRMED');
    });

    it('container đã hủy: INVALID_STATUS_TRANSITION', async () => {
      const { container } = await pendingContainer();
      await w.orders().containers.update(container.id, { status: 'CANCELLED' });

      await expectAppError(create(dispatcher, container.id), 'INVALID_STATUS_TRANSITION');
    });

    it('container đã có chuyến đang hoạt động: CONTAINER_ALREADY_IN_TRIP, không sinh chuyến thứ hai', async () => {
      const { container } = await pendingContainer();
      await create(dispatcher, container.id);

      await expectAppError(create(dispatcher, container.id), 'CONTAINER_ALREADY_IN_TRIP');
      const links = (await w.repo().tripContainers.list()).filter(
        (l) => l.orderContainerId === container.id,
      );
      expect(links).toHaveLength(1);
    });

    it('chuyến cũ đã hủy thì container lập chuyến mới được', async () => {
      const { container } = await pendingContainer();
      const first = await create(dispatcher, container.id);
      await w.repo().trips.update(first.trip.id, { status: 'CANCELLED' });
      await w.orders().containers.update(container.id, { status: 'PENDING' });

      const second = await create(dispatcher, container.id);

      expect(second.trip.id).not.toBe(first.trip.id);
    });

    it('hai Điều vận cùng tạo chuyến cho một container: đúng một người thành công', async () => {
      const { container } = await pendingContainer();

      const results = await Promise.allSettled([
        create(dispatcher, container.id),
        create({ ...dispatcher, requestId: 'khac' }, container.id),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const links = (await w.repo().tripContainers.list()).filter(
        (l) => l.orderContainerId === container.id,
      );
      expect(links).toHaveLength(1);
    });

    it('window sai (kết thúc không sau bắt đầu): VALIDATION_ERROR', async () => {
      const { container } = await pendingContainer();

      await expectAppError(
        create(dispatcher, container.id, { plannedEnd: new Date(WINDOW.plannedStart) }),
        'VALIDATION_ERROR',
      );
    });

    it('VIEWER bị FORBIDDEN; tenant khác không thấy container: NOT_FOUND', async () => {
      const { container } = await pendingContainer();

      await expectAppError(create(viewer, container.id), 'FORBIDDEN');
      await expectAppError(create(dispatcherB, container.id), 'NOT_FOUND');
      expect((await w.orders().containers.get(container.id))?.status).toBe('PENDING');
    });
  });

  describe('updateTripTimes', () => {
    const NEW_TIMES = { plannedStart: at('02:00'), plannedEnd: at('06:00') };

    it('đổi giờ chuyến, tăng version, ghi audit', async () => {
      const { container } = await pendingContainer();
      const { trip } = await create(dispatcher, container.id);

      const result = await w.service.updateTripTimes(dispatcher, {
        tripId: trip.id,
        version: trip.version,
        ...NEW_TIMES,
      });

      expect(result.trip).toMatchObject({ ...NEW_TIMES, version: trip.version + 1 });
      const audit = await listAuditForEntity(w.tdb(A), 'consolidated_trips', trip.id);
      expect(audit.map((e) => e.action)).toContain('UPDATE_TIMES');
    });

    it('version cũ: STALE_DATA và giờ không đổi', async () => {
      const { container } = await pendingContainer();
      const { trip } = await create(dispatcher, container.id);

      await expectAppError(
        w.service.updateTripTimes(dispatcher, {
          tripId: trip.id,
          version: trip.version + 3,
          ...NEW_TIMES,
        }),
        'STALE_DATA',
      );
      expect((await w.repo().trips.get(trip.id))?.plannedStart).toEqual(trip.plannedStart);
    });

    it('chuyến đã DISPATCHED hoặc đã hủy không sửa giờ: INVALID_STATUS_TRANSITION', async () => {
      const { container } = await pendingContainer();
      const { trip } = await create(dispatcher, container.id);
      await w.repo().trips.update(trip.id, { status: 'DISPATCHED' });

      await expectAppError(
        w.service.updateTripTimes(dispatcher, {
          tripId: trip.id,
          version: trip.version,
          ...NEW_TIMES,
        }),
        'INVALID_STATUS_TRANSITION',
      );
    });

    it('chuyến đã gán: dời giờ dời luôn assignment hoạt động', async () => {
      const r = await w.newResources();
      const { trip } = await w.newTrip({ start: at('01:00'), end: at('05:00') });
      const planned = await w.assign(dispatcher, trip.id, r.ids);

      const result = await w.service.updateTripTimes(dispatcher, {
        tripId: trip.id,
        version: planned.trip.version,
        ...NEW_TIMES,
      });

      expect(result.assignments).toHaveLength(3);
      expect(
        result.assignments.every(
          (a) => a.plannedStart.getTime() === NEW_TIMES.plannedStart.getTime(),
        ),
      ).toBe(true);
      expect(
        result.assignments.every((a) => a.plannedEnd.getTime() === NEW_TIMES.plannedEnd.getTime()),
      ).toBe(true);
    });

    it('chuyến đã gán: dời sang giờ trùng chuyến khác thì RESOURCE_TIME_CONFLICT và giờ cũ giữ nguyên', async () => {
      const r = await w.newResources();
      const other = await w.newTrip({ start: at('08:00'), end: at('12:00') });
      await w.assign(dispatcher, other.trip.id, r.ids);
      const { trip } = await w.newTrip({ start: at('01:00'), end: at('05:00') });
      const planned = await w.assign(dispatcher, trip.id, r.ids);

      await expectAppError(
        w.service.updateTripTimes(dispatcher, {
          tripId: trip.id,
          version: planned.trip.version,
          plannedStart: at('07:00'),
          plannedEnd: at('11:00'),
        }),
        'RESOURCE_TIME_CONFLICT',
      );

      const after = await w.repo().trips.get(trip.id);
      expect(after?.plannedStart).toEqual(at('01:00'));
      expect(after?.version).toBe(planned.trip.version);
    });

    it('window sai: VALIDATION_ERROR; VIEWER: FORBIDDEN; tenant khác: NOT_FOUND', async () => {
      const { container } = await pendingContainer();
      const { trip } = await create(dispatcher, container.id);
      const input = { tripId: trip.id, version: trip.version };

      await expectAppError(
        w.service.updateTripTimes(dispatcher, {
          ...input,
          plannedStart: at('05:00'),
          plannedEnd: at('04:00'),
        }),
        'VALIDATION_ERROR',
      );
      await expectAppError(
        w.service.updateTripTimes(viewer, { ...input, ...NEW_TIMES }),
        'FORBIDDEN',
      );
      await expectAppError(
        w.service.updateTripTimes(dispatcherB, { ...input, ...NEW_TIMES }),
        'NOT_FOUND',
      );
    });
  });
});
