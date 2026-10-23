// Bảng điều vận Kanban (task 07, bước 1): getDispatchBoard / getBoardCards phân cột, lọc, phân trang, tách tenant.
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BOARD_COLUMN_IDS, BOARD_PAGE_SIZE, type BoardCard } from '@shared/dispatch-board';
import { SEED_USERS } from '../../lib/db/seeds/identity.test-data';
import { SEED_CUSTOMERS } from '../../lib/db/seeds/master-data.test-data';
import { SEED_ORDER_CONTAINERS, SEED_ORDERS } from '../../lib/db/seeds/orders.test-data';
import {
  consolidatedTrips,
  dispatchAssignments,
  orderContainers,
  orderStops,
  tripContainers,
} from '../../lib/db/schema';
import {
  A,
  at,
  ctxOf,
  createWorld,
  dispatcher,
  dispatcherB,
  expectAppError,
  type World,
} from './dispatch.test-world';

// Ngày xem 26/10/2026 giờ Việt Nam = [25/10 17:00Z, 26/10 17:00Z).
const DATE = '2026-10-26';
const accountant = ctxOf(A, SEED_USERS.accountant.id, 'ACCOUNTANT');

describe('getDispatchBoard', () => {
  let w: World;

  beforeAll(async () => {
    w = await createWorld();
  });

  afterAll(async () => {
    await w?.stop();
  });

  const board = (
    input: Partial<Parameters<World['service']['getDispatchBoard']>[1]> = {},
    ctx = dispatcher,
  ) => w.service.getDispatchBoard(ctx, { date: DATE, ...input });
  const idsOf = (cards: BoardCard[] | undefined) => (cards ?? []).map((c) => c.orderContainerId);
  const allIds = (b: Awaited<ReturnType<typeof board>>) =>
    BOARD_COLUMN_IDS.flatMap((id) => idsOf(b.columns[id]?.cards));

  // Giờ Stop đầu của container (mốc "khung giờ" trên thẻ Chờ điều).
  const setWindow = (containerId: string, iso: string | null) =>
    w
      .tdb(A)
      .update(
        orderStops,
        { windowStart: iso === null ? null : new Date(iso) },
        and(eq(orderStops.orderContainerId, containerId), eq(orderStops.sequenceNo, 1)),
      );
  const waiting = async (iso: string | null = '2026-10-26T03:00:00.000Z', options = {}) => {
    const made = await w.newContainer({ status: 'PENDING', ...options });
    await setWindow(made.container.id, iso);
    return made;
  };
  const setTripStatus = (tripId: string, status: 'IN_TRANSIT' | 'COMPLETED' | 'DISPATCHED') =>
    w.tdb(A).update(consolidatedTrips, { status }, eq(consolidatedTrips.id, tripId));

  describe('phân cột', () => {
    it('mỗi container một thẻ nằm đúng cột theo trạng thái; Chờ móc rơ moóc rỗng', async () => {
      const wait = await waiting();
      const r = await w.newResources();
      const planned = await w.newTrip({ start: at('02:00'), end: at('05:00') });
      await w.assign(dispatcher, planned.trip.id, r.ids);

      const r2 = await w.newResources();
      const dispatched = await w.newTrip({ start: at('02:00'), end: at('05:00') });
      await w.assign(dispatcher, dispatched.trip.id, r2.ids);
      await w.service.dispatchTrip(dispatcher, {
        tripId: dispatched.trip.id,
        version: (await w.repo().trips.get(dispatched.trip.id))!.version,
      });

      const r3 = await w.newResources();
      const running = await w.newTrip({ start: at('02:00'), end: at('05:00') });
      await w.assign(dispatcher, running.trip.id, r3.ids);
      await setTripStatus(running.trip.id, 'IN_TRANSIT');

      const done = await w.newTrip({ start: at('02:00'), end: at('05:00') });
      await setTripStatus(done.trip.id, 'COMPLETED');
      const verifiedDone = await w.newTrip({ start: at('02:00'), end: at('05:00') });
      await setTripStatus(verifiedDone.trip.id, 'COMPLETED');
      await w
        .tdb(A)
        .update(
          orderContainers,
          { isEpodVerified: true },
          eq(orderContainers.id, verifiedDone.containerId),
        );

      const b = await board();

      expect(idsOf(b.columns.WAITING?.cards)).toContain(wait.container.id);
      expect(idsOf(b.columns.PLANNED?.cards)).toContain(planned.containerId);
      expect(idsOf(b.columns.DISPATCHED?.cards)).toContain(dispatched.containerId);
      expect(idsOf(b.columns.IN_TRANSIT?.cards)).toContain(running.containerId);
      expect(idsOf(b.columns.AWAITING_DOCS?.cards)).toContain(done.containerId);
      expect(allIds(b)).not.toContain(verifiedDone.containerId); // đã xác nhận ePOD thì rời bảng
      expect(b.columns.AWAITING_HOOK).toEqual({ total: 0, cards: [], nextCursor: null });
      for (const id of BOARD_COLUMN_IDS) {
        expect(b.columns[id]!.total).toBeGreaterThanOrEqual(b.columns[id]!.cards.length);
      }
      // Mỗi container đúng một thẻ.
      const ids = allIds(b);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('thẻ đã có chuyến mang biển số, tài xế, rơ moóc và phiên bản chuyến', async () => {
      const r = await w.newResources();
      const t = await w.newTrip({ start: at('02:00'), end: at('05:00') });
      await w.assign(dispatcher, t.trip.id, r.ids);

      const card = (await board()).columns.PLANNED!.cards.find(
        (c) => c.orderContainerId === t.containerId,
      )!;

      expect(card).toMatchObject({
        column: 'PLANNED',
        tractorPlate: r.tractor.plateNumber,
        trailerPlate: r.trailer.plateNumber,
        driverName: r.driver.fullName,
        windowFromTrip: true,
        windowStart: at('02:00').toISOString(),
        windowEnd: at('05:00').toISOString(),
        trip: { id: t.trip.id, status: 'PLANNED', version: expect.any(Number) },
      });
    });

    it('thẻ chờ điều chưa có chuyến: khung gợi ý = giờ Stop đầu + 3,5 giờ, chưa có xe', async () => {
      const made = await waiting('2026-10-26T07:00:00.000Z');

      const card = (await board()).columns.WAITING!.cards.find(
        (c) => c.orderContainerId === made.container.id,
      )!;

      expect(card).toMatchObject({
        trip: null,
        windowFromTrip: false,
        windowStart: '2026-10-26T07:00:00.000Z',
        windowEnd: '2026-10-26T10:30:00.000Z',
        tractorPlate: null,
        driverName: null,
      });
    });

    it('hủy gán xe (Hoàn tác): chuyến PLANNED không còn xe quay về Chờ điều, vẫn mang chuyến để gán lại', async () => {
      const r = await w.newResources();
      const t = await w.newTrip({ start: at('02:00'), end: at('05:00') });
      const assigned = await w.assign(dispatcher, t.trip.id, r.ids);
      await w.service.cancelAssignment(dispatcher, {
        tripId: t.trip.id,
        version: assigned.trip.version,
      });

      const b = await board();

      expect(idsOf(b.columns.PLANNED?.cards)).not.toContain(t.containerId);
      const card = b.columns.WAITING!.cards.find((c) => c.orderContainerId === t.containerId)!;
      expect(card.trip).toMatchObject({ id: t.trip.id, status: 'PLANNED' });
      expect(card.tractorPlate).toBeNull();
    });

    it('Order nháp, Order hủy, container hủy và chuyến hủy không có thẻ', async () => {
      const draftContainer = SEED_ORDER_CONTAINERS.find(
        (c) => c.orderId === SEED_ORDERS.find((o) => o.orderNo === 'EXP-2610-044')!.id,
      )!;
      const cancelledOrderContainer = SEED_ORDER_CONTAINERS.find(
        (c) => c.orderId === SEED_ORDERS.find((o) => o.orderNo === 'IMP-2610-029')!.id,
      )!;
      const cancelled = await waiting();
      await w
        .tdb(A)
        .update(
          orderContainers,
          { status: 'CANCELLED' },
          eq(orderContainers.id, cancelled.container.id),
        );
      const tripCancelled = await w.newTrip({ start: at('02:00'), end: at('05:00') });
      await w
        .tdb(A)
        .update(
          consolidatedTrips,
          { status: 'CANCELLED' },
          eq(consolidatedTrips.id, tripCancelled.trip.id),
        );

      const ids = allIds(await board());

      expect(ids).not.toContain(draftContainer.id);
      expect(ids).not.toContain(cancelledOrderContainer.id);
      expect(ids).not.toContain(cancelled.container.id);
      expect(ids).not.toContain(tripCancelled.containerId);
    });
  });

  describe('ngày', () => {
    it('Chờ điều: tồn từ ngày trước và chưa có giờ vẫn hiện; mốc ngày sau thì không', async () => {
      const backlog = await waiting('2026-10-20T03:00:00.000Z');
      const noWindow = await waiting(null);
      const tomorrow = await waiting('2026-10-27T03:00:00.000Z');
      const justInside = await waiting('2026-10-26T16:59:00.000Z');
      const justOutside = await waiting('2026-10-26T17:00:00.000Z'); // 00:00 ngày 27 giờ Việt Nam

      const ids = idsOf((await board()).columns.WAITING?.cards);

      expect(ids).toContain(backlog.container.id);
      expect(ids).toContain(noWindow.container.id);
      expect(ids).toContain(justInside.container.id);
      expect(ids).not.toContain(tomorrow.container.id);
      expect(ids).not.toContain(justOutside.container.id);
    });

    it('cột chuyến chỉ lấy chuyến giao với ngày xem (theo giờ Việt Nam)', async () => {
      const r = await w.newResources();
      const today = await w.newTrip({ start: at('02:00'), end: at('05:00') });
      await w.assign(dispatcher, today.trip.id, r.ids);
      const r2 = await w.newResources();
      const other = await w.newTrip({
        start: at('02:00', '2026-10-29'),
        end: at('05:00', '2026-10-29'),
      });
      await w.assign(dispatcher, other.trip.id, r2.ids);
      const r3 = await w.newResources();
      // Chuyến qua nửa đêm: bắt đầu 25/10 22:00 giờ VN (15:00Z), kết thúc 26/10 02:00 giờ VN.
      const overnight = await w.newTrip({
        start: at('15:00', '2026-10-25'),
        end: at('19:00', '2026-10-25'),
      });
      await w.assign(dispatcher, overnight.trip.id, r3.ids);

      const ids = idsOf((await board()).columns.PLANNED?.cards);

      expect(ids).toContain(today.containerId);
      expect(ids).toContain(overnight.containerId);
      expect(ids).not.toContain(other.containerId);
      expect(idsOf((await board({ date: '2026-10-29' })).columns.PLANNED?.cards)).toContain(
        other.containerId,
      );
    });
  });

  describe('bộ lọc', () => {
    it('chiều hàng: lọc Xuất/Nhập; số đếm theo chiều không đổi khi đang lọc một chiều', async () => {
      const imp = await waiting('2026-10-26T03:00:00.000Z', { kind: 'IMPORT' });
      const exp = await waiting('2026-10-26T03:00:00.000Z', { kind: 'EXPORT' });

      const all = await board();
      const onlyExport = await board({ direction: 'EXPORT' });
      const onlyImport = await board({ direction: 'IMPORT' });

      expect(idsOf(onlyExport.columns.WAITING?.cards)).toContain(exp.container.id);
      expect(idsOf(onlyExport.columns.WAITING?.cards)).not.toContain(imp.container.id);
      expect(idsOf(onlyImport.columns.WAITING?.cards)).toContain(imp.container.id);
      expect(idsOf(onlyImport.columns.WAITING?.cards)).not.toContain(exp.container.id);
      expect(onlyExport.directionCounts).toEqual(all.directionCounts);
      expect(all.directionCounts.ALL).toBe(all.directionCounts.EXPORT + all.directionCounts.IMPORT);
      expect(all.directionCounts.EXPORT).toBeGreaterThan(0);
    });

    it('khách hàng', async () => {
      const imp = await waiting(); // Order nhập của VSIP
      const exp = await waiting('2026-10-26T03:00:00.000Z', { kind: 'EXPORT' }); // Order xuất của Thép Nam Long

      const ids = allIds(await board({ customerId: SEED_CUSTOMERS.thepNamLong.id }));

      expect(ids).toContain(exp.container.id);
      expect(ids).not.toContain(imp.container.id);
    });

    it('khu vực: theo khu vực của Stop hoặc đầu/cuối tuyến', async () => {
      const imp = await waiting(); // Cát Lái, Sóng Thần, Thủ Đức
      const exp = await waiting('2026-10-26T03:00:00.000Z', { kind: 'EXPORT' }); // Thủ Đức, Biên Hòa, Cát Lái

      const bienHoa = allIds(await board({ zone: 'Biên Hòa' }));
      const catLai = allIds(await board({ zone: 'Cát Lái' }));

      expect(bienHoa).toContain(exp.container.id);
      expect(bienHoa).not.toContain(imp.container.id);
      expect(catLai).toContain(exp.container.id);
      expect(catLai).toContain(imp.container.id);
      expect(allIds(await board({ zone: 'Vùng không có' }))).toEqual([]);
    });

    it('ô tìm: số container, mã Order, tên khách (không phân biệt hoa thường và dấu)', async () => {
      const imp = await waiting();
      const exp = await waiting('2026-10-26T03:00:00.000Z', { kind: 'EXPORT' });

      const byNo = allIds(await board({ q: imp.container.containerNo!.toLowerCase() }));
      const byOrder = allIds(await board({ q: 'exp-2610-046' }));
      const byCustomer = allIds(await board({ q: 'thep nam long' }));

      expect(byNo).toEqual([imp.container.id]);
      expect(byOrder).toContain(exp.container.id);
      expect(byOrder).not.toContain(imp.container.id);
      expect(byCustomer).toContain(exp.container.id);
      expect(byCustomer).not.toContain(imp.container.id);
      expect(allIds(await board({ q: 'khong-co-gi-khop' }))).toEqual([]);
    });
  });

  describe('thẻ', () => {
    it('mang nhãn: cảng, cut-off, DEM/DET, cont lạnh, hàng nguy hiểm, Street Turn, thiếu số cont và khối lượng', async () => {
      const made = await waiting('2026-10-26T03:00:00.000Z', {
        kind: 'EXPORT',
        containerType: '40RF',
        isDangerousGoods: true,
        cargoWeightTons: null,
        portReadinessStatus: 'HOLD_CUSTOMS',
      });
      const detFreeUntil = new Date('2026-10-28T03:00:00.000Z');
      await w.tdb(A).update(
        orderContainers,
        {
          containerNo: null,
          demFreeUntil: new Date('2026-10-27T03:00:00.000Z'),
          detFreeUntil,
          linkedContainerId: made.container.id, // chỉ cần khác null để đánh dấu Street Turn
        },
        eq(orderContainers.id, made.container.id),
      );

      const card = (await board()).columns.WAITING!.cards.find(
        (c) => c.orderContainerId === made.container.id,
      )!;

      expect(card).toMatchObject({
        portReadiness: 'HOLD_CUSTOMS',
        isReefer: true,
        isDangerousGoods: true,
        isStreetTurn: true,
        containerNo: null,
        demFreeUntil: '2026-10-27T03:00:00.000Z',
        detFreeUntil: detFreeUntil.toISOString(),
        orderType: 'EXPORT',
        orderNo: 'EXP-2610-046',
        customerName: expect.any(String),
      });
      expect(card.cutOffAt).toBe(
        SEED_ORDERS.find((o) => o.orderNo === 'EXP-2610-046')!.cutOffAt!.toISOString(),
      );
      expect(card.missing.sort()).toEqual(['CONTAINER_NO', 'WEIGHT']);
      expect(card.routeName).toContain('–');
    });
  });

  describe('làn xe', () => {
    it('đầu kéo có khối chuyến, bảo dưỡng chồng ngày và nhãn giấy tờ sắp hết hạn', async () => {
      const r = await w.newResources();
      const t = await w.newTrip({ start: at('02:00'), end: at('05:00') });
      await w.assign(dispatcher, t.trip.id, r.ids);
      const expiring = await w.newTractor(A, { registrationExpiry: '2026-10-30' }); // còn 4 ngày so với 26/10
      await w.fleet().maintenanceOrders.insert({
        tractorId: expiring.id,
        type: 'SCHEDULED',
        plannedStart: at('00:00'),
        plannedEnd: at('04:00'),
        status: 'PLANNED',
      });
      const nearService = await w.newTractor(A, {
        currentOdometer: 99_500,
        nextMaintenanceOdometer: 100_000,
      });

      const lanes = (await board()).lanes!;
      const lane = (id: string) => lanes.find((l) => l.tractorId === id)!;

      expect(lane(r.tractor.id).blocks).toEqual([
        expect.objectContaining({
          kind: 'TRIP',
          tripId: t.trip.id,
          start: at('02:00').toISOString(),
          end: at('05:00').toISOString(),
        }),
      ]);
      expect(lane(expiring.id).blocks).toEqual([expect.objectContaining({ kind: 'MAINTENANCE' })]);
      expect(
        lane(expiring.id)
          .badges.map((b) => b.label)
          .join(' '),
      ).toMatch(/Đăng kiểm/);
      expect(
        lane(nearService.id)
          .badges.map((b) => b.label)
          .join(' '),
      ).toMatch(/bảo dưỡng/i);
      expect(lane(r.tractor.id).plateNumber).toBe(r.tractor.plateNumber);
    });

    it('tải một cột (kèm column) thì không trả làn xe', async () => {
      const b = await board({ column: 'WAITING' });
      expect(b.lanes).toBeNull();
      expect(Object.keys(b.columns)).toEqual(['WAITING']);
    });
  });

  describe('tenant và quyền', () => {
    it('tenant B không thấy thẻ, chuyến và làn xe của tenant A', async () => {
      const made = await waiting();
      const r = await w.newResources();
      const t = await w.newTrip({ start: at('02:00'), end: at('05:00') });
      await w.assign(dispatcher, t.trip.id, r.ids);

      const b = await board({}, dispatcherB);
      const mine = allIds(await board());

      expect(mine).toContain(made.container.id);
      expect(allIds(b)).not.toContain(made.container.id);
      expect(allIds(b)).not.toContain(t.containerId);
      expect(b.lanes!.some((l) => l.tractorId === r.tractor.id)).toBe(false);
    });

    it('Kế toán không xem được bảng (FORBIDDEN); người chỉ xem thì xem được', async () => {
      await expectAppError(board({}, accountant), 'FORBIDDEN');
      await expect(board({}, ctxOf(A, SEED_USERS.viewer.id, 'VIEWER'))).resolves.toBeDefined();
    });

    it('ngày sai định dạng bị từ chối', async () => {
      await expectAppError(board({ date: '26/10/2026' }), 'VALIDATION_ERROR');
    });
  });

  describe('getBoardCards', () => {
    it('trả thẻ mới nhất của đúng các container được hỏi; container ngoài bảng vào removedIds', async () => {
      const r = await w.newResources();
      const t = await w.newTrip({ start: at('02:00'), end: at('05:00') });
      await w.assign(dispatcher, t.trip.id, r.ids);
      const offBoard = await w.newTrip({
        start: at('02:00', '2026-10-29'),
        end: at('05:00', '2026-10-29'),
      });
      await w.assign(dispatcher, offBoard.trip.id, (await w.newResources()).ids);

      const result = await w.service.getBoardCards(dispatcher, {
        date: DATE,
        orderContainerIds: [
          t.containerId,
          offBoard.containerId,
          '0190a000-0000-7000-9999-ffffffffffff',
        ],
      });

      expect(result.cards.map((c) => c.orderContainerId)).toEqual([t.containerId]);
      expect(result.cards[0]).toMatchObject({
        column: 'PLANNED',
        tractorPlate: r.tractor.plateNumber,
      });
      expect(result.removedIds.sort()).toEqual(
        [offBoard.containerId, '0190a000-0000-7000-9999-ffffffffffff'].sort(),
      );
    });

    it('không trả container của tenant khác', async () => {
      const made = await waiting();

      const result = await w.service.getBoardCards(dispatcherB, {
        date: DATE,
        orderContainerIds: [made.container.id],
      });

      expect(result.cards).toEqual([]);
      expect(result.removedIds).toEqual([made.container.id]);
    });

    it('Kế toán bị FORBIDDEN', async () => {
      await expectAppError(
        w.service.getBoardCards(accountant, { date: DATE, orderContainerIds: ['x'.repeat(36)] }),
        'FORBIDDEN',
      );
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Phân trang và hiệu năng chạy trên thế giới riêng để số thẻ không lẫn với các test trên.
describe('getDispatchBoard: phân trang và hiệu năng', () => {
  let w: World;

  beforeAll(async () => {
    w = await createWorld();
  });

  afterAll(async () => {
    await w?.stop();
  });

  const DAY_START = new Date('2026-10-25T17:00:00.000Z').getTime();

  // Tạo hàng loạt container Chờ điều (3 Stop như thật) với giờ Stop đầu tăng dần mỗi phút.
  async function bulkWaiting(count: number, startMinute = 0) {
    const sample = await w.newContainer({ status: 'PENDING' });
    const orderId = sample.order.id;
    const rows = Array.from({ length: count }, (_, i) => ({
      orderId,
      lineNo: 5000 + startMinute + i,
      routeId: sample.container.routeId,
      containerNo: null,
      containerType: '40HC' as const,
      cargoWeightTons: '10.00',
      portReadinessStatus: 'READY_EDO' as const,
      status: 'PENDING' as const,
    }));
    const containers = await w.tdb(A).insert(orderContainers, rows);
    await w.tdb(A).insert(
      orderStops,
      containers.map((c, i) => ({
        orderId,
        orderContainerId: c.id,
        sequenceNo: 1,
        stopType: 'PICK_FULL' as const,
        locationId: sample.stops[0]!.locationId,
        locationName: sample.stops[0]!.locationName,
        windowStart: new Date(DAY_START + (startMinute + i) * 60_000),
      })),
    );
    return containers;
  }

  it('phân trang theo cursor: không trùng, không sót, đúng thứ tự giờ; chèn thẻ mới phía trước giữa hai trang không làm lệch', async () => {
    const made = await bulkWaiting(130);
    const madeIds = new Set(made.map((c) => c.id));
    const call = (cursor?: string) =>
      w.service.getDispatchBoard(dispatcher, {
        date: DATE,
        column: 'WAITING',
        ...(cursor ? { cursor } : {}),
      });

    const first = await call();
    const firstColumn = first.columns.WAITING!;
    expect(firstColumn.cards).toHaveLength(BOARD_PAGE_SIZE);
    expect(firstColumn.nextCursor).toBeTruthy();

    // Có người chèn một container giờ sớm hơn cả trang đầu trong lúc người dùng chưa bấm "Tải thêm".
    await bulkWaiting(1, -500);
    const second = await call(firstColumn.nextCursor!);
    const secondColumn = second.columns.WAITING!;

    const seen = [...firstColumn.cards, ...secondColumn.cards].map((c) => c.orderContainerId);
    expect(new Set(seen).size).toBe(seen.length);
    expect(secondColumn.nextCursor).toBeNull();
    expect(seen.filter((id) => madeIds.has(id))).toHaveLength(130);
    const windows = [...firstColumn.cards, ...secondColumn.cards]
      .map((c) => c.windowStart)
      .filter((v): v is string => v !== null);
    expect([...windows].sort()).toEqual(windows);
  });

  it('cursor sai bị từ chối', async () => {
    await expectAppError(
      w.service.getDispatchBoard(dispatcher, { date: DATE, column: 'WAITING', cursor: '###' }),
      'VALIDATION_ERROR',
    );
  });

  it('300 thẻ trong ngày: tải cả bảng dưới 2 giây', async () => {
    // 150 Chờ điều (130 đã có ở test trên + bổ sung) + 150 thẻ có chuyến ở ba cột.
    const waitingNow = await bulkWaiting(150, 1000);
    expect(waitingNow).toHaveLength(150);
    const sample = await w.newContainer({ status: 'PLANNED' });
    const tractors = await w.fleet().tractors.list();
    const drivers = await w.fleet().drivers.list();
    const trailers = await w.fleet().trailers.list();
    const planned = await bulkWaiting(150, 3000);
    await w.tdb(A).update(
      orderContainers,
      { status: 'PLANNED' },
      inArray(
        orderContainers.id,
        planned.map((c) => c.id),
      ),
    );
    const statuses = ['PLANNED', 'DISPATCHED', 'IN_TRANSIT'] as const;
    const trips = await w.tdb(A).insert(
      consolidatedTrips,
      planned.map((c, i) => ({
        tripCode: `TRIP-P-${i}`,
        routeId: sample.container.routeId,
        plannedStart: new Date(DAY_START + (300 + i) * 60_000),
        plannedEnd: new Date(DAY_START + (400 + i) * 60_000),
        status: statuses[i % 3]!,
      })),
    );
    await w.tdb(A).insert(
      tripContainers,
      trips.map((t, i) => ({
        tripId: t.id,
        orderContainerId: planned[i]!.id,
        orderId: sample.order.id,
      })),
    );
    const stopRows = await w.tdb(A).select(
      orderStops,
      inArray(
        orderStops.orderContainerId,
        planned.map((c) => c.id),
      ),
    );
    const stopOf = new Map(stopRows.map((s) => [s.orderContainerId, s.id]));
    await w.tdb(A).insert(
      dispatchAssignments,
      trips.map((t, i) => ({
        consolidatedTripId: t.id,
        stopId: stopOf.get(planned[i]!.id)!,
        assignmentType: 'INTERNAL_FLEET' as const,
        driverId: drivers[i % drivers.length]!.id,
        tractorId: tractors[i % tractors.length]!.id,
        trailerId: trailers[i % trailers.length]!.id,
        plannedStart: t.plannedStart,
        plannedEnd: t.plannedEnd,
        status: 'ASSIGNED' as const,
        dispatchedAt: t.plannedStart,
      })),
    );

    const started = performance.now();
    const b = await w.service.getDispatchBoard(dispatcher, { date: DATE });
    const elapsed = performance.now() - started;

    const total = BOARD_COLUMN_IDS.reduce((sum, id) => sum + (b.columns[id]?.total ?? 0), 0);
    expect(total).toBeGreaterThanOrEqual(300);
    expect(elapsed, `tải bảng mất ${Math.round(elapsed)} ms`).toBeLessThan(2000);
  }, 120_000);
});
