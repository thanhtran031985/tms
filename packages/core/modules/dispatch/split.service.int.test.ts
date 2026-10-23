// Tách chuyến ghép và hủy container/Order đang nằm trên chuyến (task 08, bước 1; spec 03 mục 4). Đỏ vì chưa có split.service.
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listAuditForEntity } from '../../lib/audit/repo';
import { dispatchAssignments, orderStops, tripContainers } from '../../lib/db/schema';
import {
  A,
  CUSTOMER,
  admin,
  at,
  createWorld,
  dispatcher,
  dispatcherB,
  expectAppError,
  viewer,
  type World,
} from './dispatch.test-world';

let w: World;
beforeAll(async () => {
  w = await createWorld();
});
afterAll(async () => {
  await w?.stop();
});

const containerRow = async (id: string) => (await w.orders().containers.get(id))!;
const stopIdsOf = async (containerId: string) =>
  (await w.orders().stops.list(eq(orderStops.orderContainerId, containerId))).map((s) => s.id);
const assignmentsOf = async (containerId: string) =>
  w
    .repo()
    .assignments.list(inArray(dispatchAssignments.stopId, await stopIdsOf(containerId)));

const remove = (
  tripId: string,
  version: number,
  orderContainerId: string,
  ctx = dispatcher,
  reason?: string,
) =>
  w.service.removeContainerFromTrip(ctx, {
    tripId,
    version,
    orderContainerId,
    ...(reason ? { reason } : {}),
  });

describe('removeContainerFromTrip: tách chuyến TWIN_20', () => {
  it('còn 1 cont thì chuyến về SINGLE, assignment của cont bị tách CANCELLED (không xóa), cả hai cont cần tính lại giá', async () => {
    const { a, b, trip } = await w.newTwinTrip();
    w.published.length = 0;

    const result = await remove(trip.id, trip.version, b.container.id, dispatcher, 'Khách đổi lịch');
    expect(result.trip.tripMode).toBe('SINGLE');
    expect(result.trip.version).toBe(trip.version + 1);
    expect(result.removedContainerId).toBe(b.container.id);

    const links = await w.repo().tripContainers.list(eq(tripContainers.tripId, trip.id));
    expect(links.map((l) => l.orderContainerId)).toEqual([a.container.id]);

    // Assignment của cont bị tách được giữ lại với trạng thái CANCELLED; của cont còn lại vẫn ASSIGNED.
    const removed = await assignmentsOf(b.container.id);
    expect(removed).toHaveLength(3);
    expect(removed.every((x) => x.status === 'CANCELLED')).toBe(true);
    const kept = await assignmentsOf(a.container.id);
    expect(kept.every((x) => x.status === 'ASSIGNED')).toBe(true);

    // Cont bị tách về chờ điều; cả hai cont đổi khóa tra giá (TWIN_20 -> SINGLE) nên bị đánh dấu.
    expect((await containerRow(b.container.id)).status).toBe('PENDING');
    expect((await containerRow(a.container.id)).status).toBe('PLANNED');
    expect(result.repriceContainerIds.sort()).toEqual([a.container.id, b.container.id].sort());
    for (const id of [a.container.id, b.container.id]) {
      const row = await containerRow(id);
      expect(row.repriceRequired).toBe(true);
      expect(row.appliedTripMode).toBe('SINGLE');
    }

    const audits = await listAuditForEntity(w.tdb(A), 'consolidated_trips', trip.id);
    expect(audits.map((x) => x.action)).toContain('REMOVE_CONTAINER');
    const event = w.published.find((e) => e.tripId === trip.id);
    expect([...(event?.orderContainerIds ?? [])].sort()).toEqual([a.container.id, b.container.id].sort());
  });

  it('chuyến ghép khác khách (vẫn giá SINGLE) thì tách xong không đặt cờ tính lại giá', async () => {
    const { a, b, trip } = await w.newTwinTrip({ otherCustomer: true });
    const result = await remove(trip.id, trip.version, a.container.id);
    expect(result.repriceContainerIds).toEqual([]);
    for (const id of [a.container.id, b.container.id]) {
      expect((await containerRow(id)).repriceRequired).toBe(false);
    }
  });

  it('chuyến chưa gán xe vẫn tách được', async () => {
    const { a, b, trip } = await w.newTwinTrip({ assigned: false });
    const result = await remove(trip.id, trip.version, a.container.id);
    expect(result.trip.tripMode).toBe('SINGLE');
    expect((await containerRow(a.container.id)).status).toBe('PENDING');
    expect((await containerRow(b.container.id)).status).toBe('PLANNED');
  });

  it('phân bổ Kế toán đã sửa tay được đặt lại về số hệ thống, ghi audit và gắn cờ báo Kế toán', async () => {
    const { a, b, trip } = await w.newTwinTrip();
    for (const [id, system, manual] of [
      [a.container.id, '0.500000', '0.700000'],
      [b.container.id, '0.500000', '0.300000'],
    ] as const) {
      await w.repo().tripContainers.update(trip.id, id, {
        systemRatio: system,
        systemAmount: '500000.00',
        allocationRatio: manual,
        allocatedAmount: `${Number(manual) * 1000000}.00`,
        isManualOverride: true,
        overrideReason: 'Kế toán chỉnh theo thực tế',
      });
    }
    await w.repo().trips.update(trip.id, { allocationMethod: 'MANUAL' });
    const current = (await w.repo().trips.get(trip.id))!;

    await remove(trip.id, current.version, b.container.id);

    const left = (await w.repo().tripContainers.get(trip.id, a.container.id))!;
    expect(left.allocationRatio).toBe(left.systemRatio);
    expect(left.allocatedAmount).toBe(left.systemAmount);
    expect(left.isManualOverride).toBe(false);
    const after = (await w.repo().trips.get(trip.id))!;
    expect(after.allocationMethod).not.toBe('MANUAL');
    expect(after.allocationReviewRequired).toBe(true);
    const audits = await listAuditForEntity(w.tdb(A), 'consolidated_trips', trip.id);
    expect(audits.map((x) => x.action)).toContain('RESET_ALLOCATION');
  });

  it('chuyến không sửa tay phân bổ thì không gắn cờ báo Kế toán', async () => {
    const { b, trip } = await w.newTwinTrip();
    await remove(trip.id, trip.version, b.container.id);
    expect((await w.repo().trips.get(trip.id))!.allocationReviewRequired).toBe(false);
  });

  it('gửi version cũ trả STALE_DATA và không đổi gì', async () => {
    const { a, trip } = await w.newTwinTrip();
    await expectAppError(remove(trip.id, trip.version - 1, a.container.id), 'STALE_DATA');
    expect(await w.repo().tripContainers.list(eq(tripContainers.tripId, trip.id))).toHaveLength(2);
  });

  it('không tách container cuối cùng của chuyến', async () => {
    const { a, b, trip } = await w.newTwinTrip();
    const split = await remove(trip.id, trip.version, b.container.id);
    await expectAppError(
      remove(trip.id, split.trip.version, a.container.id),
      'TRIP_LAST_CONTAINER',
    );
  });

  it('container không thuộc chuyến trả NOT_FOUND; chuyến đang chạy không tách được', async () => {
    const { trip } = await w.newTwinTrip();
    const stranger = await w.newContainer({ containerType: '20DC', status: 'PENDING' });
    await expectAppError(remove(trip.id, trip.version, stranger.container.id), 'NOT_FOUND');

    const running = await w.newTwinTrip();
    await w.repo().trips.update(running.trip.id, { status: 'IN_TRANSIT' });
    const fresh = (await w.repo().trips.get(running.trip.id))!;
    await expectAppError(
      remove(running.trip.id, fresh.version, running.b.container.id),
      'INVALID_STATUS_TRANSITION',
    );
  });

  it('chỉ OWNER, ADMIN, DISPATCHER được tách; tenant khác không thấy chuyến', async () => {
    const { b, trip } = await w.newTwinTrip();
    await expectAppError(remove(trip.id, trip.version, b.container.id, viewer), 'FORBIDDEN');
    await expectAppError(remove(trip.id, trip.version, b.container.id, dispatcherB), 'NOT_FOUND');
    const result = await remove(trip.id, trip.version, b.container.id, admin);
    expect(result.trip.tripMode).toBe('SINGLE');
  });
});

describe('hủy container và hủy Order khi container nằm trên chuyến ghép', () => {
  it('hủy một container: rời chuyến, assignment bị hủy, chuyến còn lại về SINGLE', async () => {
    const { a, b, trip } = await w.newTwinTrip();
    const order = (await w.orders().orders.get(b.container.orderId))!;
    w.published.length = 0;

    await w.orderService.cancelContainer(dispatcher, {
      orderId: order.id,
      containerId: b.container.id,
      version: order.version,
      reason: 'Khách hủy lô hàng',
      cancellationFee: null,
    });

    expect((await containerRow(b.container.id)).status).toBe('CANCELLED');
    const links = await w.repo().tripContainers.list(eq(tripContainers.tripId, trip.id));
    expect(links.map((l) => l.orderContainerId)).toEqual([a.container.id]);
    expect((await w.repo().trips.get(trip.id))!.tripMode).toBe('SINGLE');
    expect((await assignmentsOf(b.container.id)).every((x) => x.status === 'CANCELLED')).toBe(true);
    expect((await containerRow(a.container.id)).repriceRequired).toBe(true);
    expect(w.published.some((e) => e.tripId === trip.id)).toBe(true);
  });

  it('hủy cả Order: cont trên chuyến ghép rời chuyến, Order chỉ CANCELLED khi hết cont hoạt động', async () => {
    const order = await w.newOrder({ customerId: CUSTOMER.vsip });
    const inTrip = await w.newContainer({ order, containerType: '20DC', status: 'PENDING', cargoWeightTons: '6.00' });
    const idle = await w.newContainer({ order, containerType: '20DC', status: 'PENDING' });
    const partner = await w.newContainer({ containerType: '20DC', status: 'PENDING', cargoWeightTons: '6.00' });
    const trailer = await w.newTrailer(A, { trailerType: '40FT_COMBO', canCarryTwin20: true });
    const twin = await w.service.createConsolidatedTrip(dispatcher, {
      tripMode: 'TWIN_20',
      orderContainerIds: [inTrip.container.id, partner.container.id],
      plannedStart: at('08:00'),
      plannedEnd: at('12:00'),
      resources: {
        driverId: (await w.newDriver()).id,
        tractorId: (await w.newTractor()).id,
        trailerId: trailer.id,
      },
    });

    const fresh = (await w.orders().orders.get(order.id))!;
    const cancelled = await w.orderService.cancelOrder(dispatcher, {
      id: order.id,
      version: fresh.version,
      reason: 'Khách hủy Order',
      fees: [],
    });
    expect(cancelled.order.status).toBe('CANCELLED');

    for (const id of [inTrip.container.id, idle.container.id]) {
      expect((await containerRow(id)).status).toBe('CANCELLED');
    }
    const links = await w.repo().tripContainers.list(eq(tripContainers.tripId, twin.trip.id));
    expect(links.map((l) => l.orderContainerId)).toEqual([partner.container.id]);
    expect((await containerRow(partner.container.id)).status).toBe('PLANNED');
    expect((await w.repo().trips.get(twin.trip.id))!.tripMode).toBe('SINGLE');
  });

  it('hủy container duy nhất của chuyến thì chuyến cũng CANCELLED', async () => {
    const single = await w.newContainer({ containerType: '40HC', status: 'PENDING' });
    const created = await w.service.createSingleTrip(dispatcher, {
      orderContainerId: single.container.id,
      plannedStart: at('08:00'),
      plannedEnd: at('12:00'),
    });
    await w.assign(dispatcher, created.trip.id, await w.newResources().then((r) => r.ids));

    const order = (await w.orders().orders.get(single.container.orderId))!;
    await w.orderService.cancelContainer(dispatcher, {
      orderId: order.id,
      containerId: single.container.id,
      version: order.version,
      reason: 'Khách hủy lô hàng',
      cancellationFee: null,
    });
    expect((await w.repo().trips.get(created.trip.id))!.status).toBe('CANCELLED');
    expect((await assignmentsOf(single.container.id)).every((x) => x.status === 'CANCELLED')).toBe(true);
  });
});
