import { asc, eq } from 'drizzle-orm';
import { AppError } from '@shared/errors';
import { computeCheckDigit } from '@shared/iso6346';
import {
  addContainersSchema,
  cancelContainerSchema,
  cancelOrderSchema,
  createOrderInputSchema,
} from '@shared/schemas/orders';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listAuditForEntity } from '../../lib/audit/repo';
import type { RequestContext, Role } from '../../lib/context';
import { orderContainers, orderStops } from '../../lib/db/schema';
import { seedIdentity } from '../../lib/db/seeds/identity';
import { SEED_TENANTS, SEED_USERS } from '../../lib/db/seeds/identity.test-data';
import { seedMasterData } from '../../lib/db/seeds/master-data';
import {
  SEED_CUSTOMERS,
  SEED_LOCATIONS,
  SEED_ROUTES,
} from '../../lib/db/seeds/master-data.test-data';
import { seedTariffs } from '../../lib/db/seeds/tariffs';
import { getTenantDb } from '../../lib/db/tenant-db';
import { startTestInfra, type TestInfra } from '../../test/containers';
import { createOrderRepo } from './repo';
import { createOrderService, type OrderService } from './service';

const NOW = new Date('2026-10-22T05:00:00.000Z');

const ctxOf = (tenantId: string, userId: string, role: Role): RequestContext => ({
  tenantId,
  userId,
  role,
  requestId: 'test',
  timezone: 'Asia/Ho_Chi_Minh',
});

async function expectAppError(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error, `cần AppError ${code}`).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
  return error as AppError;
}

let serial = 300000;
function containerNo() {
  const body = `CNL${'U'}${String((serial += 1)).padStart(6, '0')}`;
  return `${body}${computeCheckDigit(body)}`;
}

describe('orders.service: thêm, bớt, hủy container và hủy Order', () => {
  let infra: TestInfra;
  let service: OrderService;

  const A = SEED_TENANTS.phucAn.id;
  const dispatcher = ctxOf(A, SEED_USERS.hungDv.id, 'DISPATCHER');
  const accountant = ctxOf(A, SEED_USERS.accountant.id, 'ACCOUNTANT');
  const viewer = ctxOf(A, SEED_USERS.viewer.id, 'VIEWER');
  const dispatcherB = ctxOf(SEED_TENANTS.saoViet.id, SEED_USERS.hungDv.id, 'DISPATCHER');
  const clSt = SEED_ROUTES[0];
  const place = (code: string) => SEED_LOCATIONS.find((l) => l.tenantId === A && l.code === code)!;
  const tdbA = () => getTenantDb({ tenantId: A }, { db: infra.db });
  const repoA = () => createOrderRepo(tdbA());

  beforeAll(async () => {
    infra = await startTestInfra({ redis: false });
    await seedIdentity(infra.db, { password: 'mat-khau-thu-nghiem' });
    await seedMasterData(infra.db);
    await seedTariffs(infra.db);
    service = createOrderService({
      tenantDb: (ctx) => getTenantDb(ctx, { db: infra.db }),
      now: () => NOW,
    });
  });

  afterAll(async () => {
    await infra?.stop();
  });

  const detail = (orderId: string) => service.getOrder(dispatcher, orderId);

  async function newOrder(
    types: string[],
    { confirm = false, ...extra }: { confirm?: boolean } & Record<string, unknown> = {},
  ) {
    const created = await service.createOrder(
      dispatcher,
      createOrderInputSchema.parse({
        customerId: SEED_CUSTOMERS.thepNamLong.id,
        orderType: 'IMPORT',
        bookingOrBlNo: `bl-${Math.random().toString(36).slice(2, 8)}`,
        routeId: clSt.id,
        pickupLocationId: place('CATLAI').id,
        cargoLocationId: place('KHO-NL').id,
        dropLocationId: place('DEPOT-PL').id,
        containers: types.map((containerType) => ({ containerNo: containerNo(), containerType })),
        ...extra,
      }),
    );
    if (confirm) {
      await service.confirmOrder(dispatcher, {
        id: created.order.id,
        version: created.order.version,
      });
    }
    return (await detail(created.order.id)).order;
  }

  const add = (order: { id: string; version: number }, rows: Record<string, unknown>[]) =>
    service.addContainers(
      dispatcher,
      addContainersSchema.parse({ id: order.id, version: order.version, containers: rows }),
    );
  const cancel = (
    order: { id: string; version: number },
    containerId: string,
    extra: Record<string, unknown> = {},
  ) =>
    service.cancelContainer(
      dispatcher,
      cancelContainerSchema.parse({
        orderId: order.id,
        containerId,
        version: order.version,
        reason: 'Khách đổi kế hoạch',
        ...extra,
      }),
    );
  const row = (containerType: string, extra: Record<string, unknown> = {}) => ({
    containerNo: containerNo(),
    containerType,
    ...extra,
  });

  // Mô phỏng container đã chạy một phần (task điều vận sẽ làm việc này): Stop đầu hoàn thành.
  async function startContainer(containerId: string) {
    await repoA().containers.update(containerId, { status: 'IN_PROGRESS' });
    const [first] = await repoA().stops.list(eq(orderStops.orderContainerId, containerId), {
      orderBy: [asc(orderStops.sequenceNo)],
    });
    await repoA().stops.update(first!.id, { status: 'COMPLETED' });
  }

  describe('thêm container', () => {
    it('vào Order đã CONFIRMED: cont mới được tra giá, snapshot, sinh Stop, tổng tính lại', async () => {
      const order = await newOrder(['20DC', '40HC'], { confirm: true });
      const before = await detail(order.id);

      const result = await add(order, [row('40HC')]);
      const after = await detail(order.id);

      expect(result.containers).toHaveLength(1);
      expect(after.order).toMatchObject({
        status: 'CONFIRMED',
        containerCount: 3,
        version: order.version + 1,
        totalFreightAmount: '6600000.00', // 1,8M + 2,4M + 2,4M (giá riêng Thép Nam Long)
        totalPassThroughAmount: '2200000.00',
      });
      const added = after.containers[2]!;
      expect(added).toMatchObject({
        lineNo: 3,
        baseFreightAmount: '2400000.00',
        isManualPrice: false,
        status: 'PENDING',
      });
      expect(added.freightTariffId).toBeTruthy();
      expect(after.fees.filter((f) => f.orderContainerId === added.id)).toHaveLength(1);
      // Stop của cont mới sinh theo loại đơn và sao chép địa điểm đã chọn của Order.
      const stops = after.stops.filter((s) => s.orderContainerId === added.id);
      expect(stops.map((s) => s.stopType)).toEqual(['PICK_FULL', 'UNSTUFFING', 'RETURN_EMPTY']);
      expect(stops.map((s) => s.locationName)).toEqual([
        'Cảng Cát Lái',
        'Kho Thép Nam Long',
        'Depot Phước Long',
      ]);
      // Cont cũ không bị đụng tới.
      expect(after.containers.slice(0, 2).map((c) => c.baseFreightAmount)).toEqual(
        before.containers.map((c) => c.baseFreightAmount),
      );
      expect(after.stops.length).toBe(before.stops.length + 3);
    });

    it('vào Order đã CONFIRMED nhưng cont mới không có giá: chặn cả lần thêm; có giá tay thì thêm được', async () => {
      const order = await newOrder(['20DC'], { confirm: true });

      const error = await expectAppError(add(order, [row('20DC'), row('45HC')]), 'PRICE_MISSING');
      expect(error.details).toMatchObject({ lines: '3' });
      const unchanged = await detail(order.id);
      expect(unchanged.containers).toHaveLength(1);
      expect(unchanged.order.version).toBe(order.version);

      await add(order, [
        row('45HC', { manualPrice: { price: '3000000', reason: 'Báo giá riêng cho 45HC' } }),
      ]);
      const after = await detail(order.id);
      expect(after.containers[1]).toMatchObject({
        isManualPrice: true,
        baseFreightAmount: '3000000.00',
        freightTariffId: null,
      });
      expect(after.order.totalFreightAmount).toBe('4800000.00');
    });

    it('vào Order nháp: chưa tra giá (giá chốt khi xác nhận) nhưng vẫn sinh Stop', async () => {
      const order = await newOrder(['20DC']);

      await add(order, [row('45HC')]);
      const after = await detail(order.id);

      expect(after.containers).toHaveLength(2);
      expect(after.containers[1]).toMatchObject({
        freightTariffId: null,
        baseFreightAmount: '0.00',
      });
      expect(after.order).toMatchObject({
        status: 'DRAFT',
        containerCount: 2,
        totalFreightAmount: '0.00',
      });
      expect(
        after.stops.filter((s) => s.orderContainerId === after.containers[1]!.id),
      ).toHaveLength(3);
    });

    it('số cont đã có trong Order hoặc trùng trong danh sách thêm bị chặn; trùng Order khác chỉ cảnh báo', async () => {
      const order = await newOrder(['20DC']);
      const existing = (await detail(order.id)).containers[0]!.containerNo!;
      const other = await newOrder(['20DC']);
      const otherNo = (await detail(other.id)).containers[0]!.containerNo!;

      await expectAppError(
        add(order, [row('20DC', { containerNo: existing })]),
        'VALIDATION_ERROR',
      );
      const dupNo = containerNo();
      await expectAppError(
        add(order, [row('20DC', { containerNo: dupNo }), row('20DC', { containerNo: dupNo })]),
        'VALIDATION_ERROR',
      );
      const result = await add(order, [row('20DC', { containerNo: otherNo })]);
      expect(result.warnings.map((w) => w.orderId)).toEqual([other.id]);
    });

    it('Order đã giao một phần quay lại đang thực hiện; Order đã hủy hoặc đã giao xong không thêm được', async () => {
      const partial = await newOrder(['20DC'], { confirm: true });
      await repoA().orders.update(partial.id, { status: 'PARTIALLY_DELIVERED' });
      const reopened = await detail(partial.id);
      await add(reopened.order, [row('20DC')]);
      expect((await detail(partial.id)).order.status).toBe('IN_PROGRESS');

      for (const status of ['DELIVERED', 'CANCELLED', 'RECONCILED'] as const) {
        const closed = await newOrder(['20DC']);
        await repoA().orders.update(closed.id, { status });
        await expectAppError(
          add((await detail(closed.id)).order, [row('20DC')]),
          'INVALID_STATUS_TRANSITION',
        );
      }
    });

    it('DOMESTIC: cont mới đi theo mẫu Stop của tuyến', async () => {
      const route = SEED_ROUTES[2];
      for (const [i, stopType] of (['PICK_EMPTY', 'STUFFING', 'RETURN_EMPTY'] as const).entries()) {
        await repoA().stopTemplates.insert({ routeId: route.id, sequenceNo: i + 1, stopType });
      }
      const order = await newOrder(['20DC'], {
        orderType: 'DOMESTIC',
        routeId: route.id,
        pickupLocationId: null,
        cargoLocationId: null,
        dropLocationId: null,
        containers: [{ containerType: '20DC' }],
      });

      await add(order, [{ containerType: '20DC' }]);
      const after = await detail(order.id);

      expect(
        after.stops
          .filter((s) => s.orderContainerId === after.containers[1]!.id)
          .map((s) => s.stopType),
      ).toEqual(['PICK_EMPTY', 'STUFFING', 'RETURN_EMPTY']);
    });
  });

  describe('bớt container', () => {
    it('Order nháp: xóa cont và Stop của cont, đánh lại số dòng, tính lại tổng', async () => {
      const order = await newOrder(['20DC', '40HC', '20DC']);
      const before = await detail(order.id);
      const removed = before.containers[1]!;

      const result = await service.removeContainer(dispatcher, {
        orderId: order.id,
        containerId: removed.id,
        version: order.version,
      });
      const after = await detail(order.id);

      expect(result.order.containerCount).toBe(2);
      expect(after.containers.map((c) => [c.lineNo, c.id])).toEqual([
        [1, before.containers[0]!.id],
        [2, before.containers[2]!.id],
      ]);
      expect(after.stops.some((s) => s.orderContainerId === removed.id)).toBe(false);
      expect(after.stops).toHaveLength(6);
      expect(after.order).toMatchObject({ containerCount: 2, version: order.version + 1 });
      const audit = await listAuditForEntity(tdbA(), 'orders', order.id);
      expect(audit.map((a) => a.action).sort()).toEqual(['CREATE', 'UPDATE']);
    });

    it('không bớt được cont cuối cùng của Order, cũng không bớt được khi Order đã xác nhận', async () => {
      const single = await newOrder(['20DC']);
      const only = (await detail(single.id)).containers[0]!;
      await expectAppError(
        service.removeContainer(dispatcher, {
          orderId: single.id,
          containerId: only.id,
          version: single.version,
        }),
        'VALIDATION_ERROR',
      );

      const confirmed = await newOrder(['20DC', '20DC'], { confirm: true });
      const target = (await detail(confirmed.id)).containers[1]!;
      await expectAppError(
        service.removeContainer(dispatcher, {
          orderId: confirmed.id,
          containerId: target.id,
          version: confirmed.version,
        }),
        'INVALID_STATUS_TRANSITION',
      );
      expect((await detail(confirmed.id)).containers).toHaveLength(2);
    });
  });

  describe('hủy container', () => {
    it('hủy 1 cont chưa chạy không cần phí: Order vẫn hoạt động, tổng tính lại, Stop bị bỏ qua', async () => {
      const order = await newOrder(['20DC', '40HC', '40HC'], { confirm: true });
      const before = await detail(order.id);
      const target = before.containers[1]!;

      const result = await cancel(order, target.id);
      const after = await detail(order.id);

      expect(result.orderCancelled).toBe(false);
      expect(after.order).toMatchObject({
        status: 'CONFIRMED',
        containerCount: 2,
        version: order.version + 1,
        totalFreightAmount: '4200000.00', // 1,8M + 2,4M
        totalPassThroughAmount: '1400000.00', // 600k + 800k
        totalSurchargeAmount: '0.00',
      });
      expect(after.containers[1]).toMatchObject({
        status: 'CANCELLED',
        cancelReason: 'Khách đổi kế hoạch',
      });
      expect(after.containers[0]!.status).toBe('PENDING');
      expect(
        after.stops
          .filter((s) => s.orderContainerId === target.id)
          .every((s) => s.status === 'SKIPPED'),
      ).toBe(true);
      expect(
        after.stops
          .filter((s) => s.orderContainerId !== target.id)
          .every((s) => s.status === 'PENDING'),
      ).toBe(true);
      expect(after.fees.some((f) => f.feeCode === 'CANCELLATION_FEE')).toBe(false);

      const audit = (await listAuditForEntity(tdbA(), 'orders', order.id)).find(
        (a) => a.action === 'CANCEL_CONTAINER',
      );
      expect(audit?.after).toMatchObject({
        containerId: target.id,
        lineNo: 2,
        reason: 'Khách đổi kế hoạch',
      });
    });

    it('thiếu lý do thì không hủy; cont đã hủy không hủy lại', async () => {
      const order = await newOrder(['20DC', '20DC'], { confirm: true });
      const target = (await detail(order.id)).containers[0]!;

      await expectAppError(
        service.cancelContainer(dispatcher, {
          orderId: order.id,
          containerId: target.id,
          version: order.version,
          reason: ' ',
          cancellationFee: null,
        }),
        'VALIDATION_ERROR',
      );
      expect(
        cancelContainerSchema.safeParse({
          orderId: order.id,
          containerId: target.id,
          version: 0,
          reason: '',
        }).success,
      ).toBe(false);

      const done = await cancel(order, target.id);
      await expectAppError(cancel(done.order, target.id), 'INVALID_STATUS_TRANSITION');
    });

    it('cont đã có Stop hoàn thành: thiếu phí hủy hoặc phí bằng 0 bị chặn; có phí thì hủy được và phí vào doanh thu', async () => {
      const order = await newOrder(['20DC', '40HC'], { confirm: true });
      const target = (await detail(order.id)).containers[0]!;
      await startContainer(target.id);

      await expectAppError(cancel(order, target.id), 'CANCEL_FEE_REQUIRED');
      await expectAppError(
        service.cancelContainer(dispatcher, {
          orderId: order.id,
          containerId: target.id,
          version: order.version,
          reason: 'Khách hủy',
          cancellationFee: '0.00',
        }),
        'CANCEL_FEE_REQUIRED',
      );
      expect((await detail(order.id)).containers[0]!.status).toBe('IN_PROGRESS');

      await cancel(order, target.id, { cancellationFee: '450000' });
      const after = await detail(order.id);

      expect(after.containers[0]).toMatchObject({ status: 'CANCELLED' });
      const fee = after.fees.find((f) => f.feeCode === 'CANCELLATION_FEE')!;
      expect(fee).toMatchObject({
        orderContainerId: target.id,
        feeCategory: 'REVENUE_SURCHARGE',
        source: 'MANUAL',
        amount: '450000.00',
      });
      expect(after.order).toMatchObject({
        containerCount: 1,
        totalFreightAmount: '2400000.00',
        totalSurchargeAmount: '450000.00',
        totalPassThroughAmount: '800000.00',
      });
      // Stop đã hoàn thành giữ nguyên, chỉ Stop chưa chạy bị bỏ qua.
      expect(
        after.stops.filter((s) => s.orderContainerId === target.id).map((s) => s.status),
      ).toEqual(['COMPLETED', 'SKIPPED', 'SKIPPED']);
    });

    it('cont đã giao (DELIVERED) hoặc hoàn tất (COMPLETED) không hủy được', async () => {
      const order = await newOrder(['20DC', '20DC', '20DC'], { confirm: true });
      const [delivered, completed] = (await detail(order.id)).containers;
      await repoA().containers.update(delivered!.id, { status: 'DELIVERED' });
      await repoA().containers.update(completed!.id, { status: 'COMPLETED' });

      await expectAppError(
        cancel(order, delivered!.id, { cancellationFee: '100000' }),
        'INVALID_STATUS_TRANSITION',
      );
      await expectAppError(
        cancel(order, completed!.id, { cancellationFee: '100000' }),
        'INVALID_STATUS_TRANSITION',
      );
      const after = await detail(order.id);
      expect(after.containers.map((c) => c.status)).toEqual(['DELIVERED', 'COMPLETED', 'PENDING']);
      expect(after.order.version).toBe(order.version);
    });

    it('hủy cont cuối cùng còn hoạt động: Order chuyển CANCELLED kèm lý do', async () => {
      const order = await newOrder(['20DC'], { confirm: true });
      const only = (await detail(order.id)).containers[0]!;

      const result = await cancel(order, only.id, { reason: 'Khách hủy booking' });
      const after = await detail(order.id);

      expect(result.orderCancelled).toBe(true);
      expect(after.order).toMatchObject({
        status: 'CANCELLED',
        containerCount: 0,
        totalFreightAmount: '0.00',
        cancelReason: 'Khách hủy booking',
      });
      const actions = (await listAuditForEntity(tdbA(), 'orders', order.id))
        .map((a) => a.action)
        .sort();
      expect(actions).toEqual(['CANCEL_CONTAINER', 'CONFIRM', 'CREATE', 'STATUS_CHANGE']);
    });

    it('phiên bản cũ trả STALE_DATA; container của Order khác hoặc công ty khác trả NOT_FOUND', async () => {
      const order = await newOrder(['20DC', '20DC'], { confirm: true });
      const other = await newOrder(['20DC', '20DC'], { confirm: true });
      const target = (await detail(order.id)).containers[0]!;
      const otherTarget = (await detail(other.id)).containers[0]!;
      const first = await cancel(order, target.id);

      await expectAppError(cancel(order, (await detail(order.id)).containers[1]!.id), 'STALE_DATA');
      await expectAppError(cancel(first.order, otherTarget.id), 'NOT_FOUND');
      await expectAppError(
        service.cancelContainer(dispatcherB, {
          orderId: order.id,
          containerId: target.id,
          version: first.order.version,
          reason: 'Thử',
          cancellationFee: null,
        }),
        'NOT_FOUND',
      );
    });

    it('chỉ Chủ công ty, Quản trị, Điều vận thao tác; Kế toán và Chỉ xem bị FORBIDDEN', async () => {
      const order = await newOrder(['20DC', '20DC']);
      const target = (await detail(order.id)).containers[0]!;
      const input = {
        orderId: order.id,
        containerId: target.id,
        version: order.version,
        reason: 'Thử quyền',
        cancellationFee: null,
      };

      for (const ctx of [accountant, viewer]) {
        await expectAppError(service.cancelContainer(ctx, input), 'FORBIDDEN');
        await expectAppError(
          service.removeContainer(ctx, { orderId: order.id, containerId: target.id, version: 0 }),
          'FORBIDDEN',
        );
        await expectAppError(
          service.addContainers(
            ctx,
            addContainersSchema.parse({ id: order.id, version: 0, containers: [row('20DC')] }),
          ),
          'FORBIDDEN',
        );
        await expectAppError(
          service.cancelOrder(
            ctx,
            cancelOrderSchema.parse({ id: order.id, version: 0, reason: 'Thử quyền' }),
          ),
          'FORBIDDEN',
        );
      }
    });
  });

  describe('hủy Order', () => {
    it('hủy mọi cont chưa hoàn thành; Order CANCELLED khi không còn cont hoạt động', async () => {
      const order = await newOrder(['20DC', '40HC', '40HC'], { confirm: true });

      const result = await service.cancelOrder(
        dispatcher,
        cancelOrderSchema.parse({
          id: order.id,
          version: order.version,
          reason: 'Khách hủy lô hàng',
        }),
      );
      const after = await detail(order.id);

      expect(result).toMatchObject({ orderCancelled: true, cancelledCount: 3 });
      expect(after.order).toMatchObject({
        status: 'CANCELLED',
        cancelReason: 'Khách hủy lô hàng',
        containerCount: 0,
        totalFreightAmount: '0.00',
        version: order.version + 1,
      });
      expect(after.containers.every((c) => c.status === 'CANCELLED')).toBe(true);
      expect(after.stops.every((s) => s.status === 'SKIPPED')).toBe(true);
    });

    it('cont đã chạy một phần thiếu phí hủy: không hủy gì cả; đủ phí thì hủy và ghi phí', async () => {
      const order = await newOrder(['20DC', '20DC'], { confirm: true });
      const [started, idle] = (await detail(order.id)).containers;
      await startContainer(started!.id);

      await expectAppError(
        service.cancelOrder(
          dispatcher,
          cancelOrderSchema.parse({ id: order.id, version: order.version, reason: 'Khách hủy' }),
        ),
        'CANCEL_FEE_REQUIRED',
      );
      const untouched = await detail(order.id);
      expect(untouched.containers.map((c) => c.status)).toEqual(['IN_PROGRESS', 'PENDING']);
      expect(untouched.order.version).toBe(order.version);

      const result = await service.cancelOrder(
        dispatcher,
        cancelOrderSchema.parse({
          id: order.id,
          version: order.version,
          reason: 'Khách hủy',
          fees: [{ containerId: started!.id, amount: '300000' }],
        }),
      );
      const after = await detail(order.id);

      expect(result.orderCancelled).toBe(true);
      expect(after.containers.map((c) => c.status)).toEqual(['CANCELLED', 'CANCELLED']);
      expect(after.order).toMatchObject({ status: 'CANCELLED', totalSurchargeAmount: '300000.00' });
      expect(
        after.fees.filter((f) => f.feeCode === 'CANCELLATION_FEE').map((f) => f.orderContainerId),
      ).toEqual([started!.id]);
      expect(idle!.id).not.toBe(started!.id);
    });

    it('còn cont đã giao: hủy các cont còn lại nhưng Order không CANCELLED', async () => {
      const order = await newOrder(['20DC', '20DC', '20DC'], { confirm: true });
      const [delivered] = (await detail(order.id)).containers;
      await repoA().containers.update(delivered!.id, { status: 'DELIVERED' });
      await repoA().orders.update(order.id, { status: 'IN_PROGRESS' });
      const current = (await detail(order.id)).order;

      const result = await service.cancelOrder(
        dispatcher,
        cancelOrderSchema.parse({
          id: order.id,
          version: current.version,
          reason: 'Khách hủy phần còn lại',
        }),
      );
      const after = await detail(order.id);

      expect(result).toMatchObject({ orderCancelled: false, cancelledCount: 2 });
      expect(after.order.status).toBe('IN_PROGRESS');
      expect(after.containers.map((c) => c.status)).toEqual([
        'DELIVERED',
        'CANCELLED',
        'CANCELLED',
      ]);
      expect(after.order.containerCount).toBe(1);
    });

    it('Order đã giao xong, đã đối soát hoặc đã hủy không hủy được; STALE_DATA khi phiên bản cũ', async () => {
      const order = await newOrder(['20DC'], { confirm: true });
      await expectAppError(
        service.cancelOrder(
          dispatcher,
          cancelOrderSchema.parse({ id: order.id, version: order.version + 5, reason: 'Thử' }),
        ),
        'STALE_DATA',
      );

      for (const status of ['DELIVERED', 'RECONCILED', 'CANCELLED'] as const) {
        const closed = await newOrder(['20DC']);
        await repoA().orders.update(closed.id, { status });
        const current = (await detail(closed.id)).order;
        await expectAppError(
          service.cancelOrder(
            dispatcher,
            cancelOrderSchema.parse({ id: closed.id, version: current.version, reason: 'Thử' }),
          ),
          'INVALID_STATUS_TRANSITION',
        );
      }
      expect(
        (await repoA().containers.list(eq(orderContainers.orderId, order.id)))[0]!.status,
      ).toBe('PENDING');
    });
  });
});
