import { AppError } from '@shared/errors';
import { computeCheckDigit } from '@shared/iso6346';
import { createOrderInputSchema, type CreateOrderInput } from '@shared/schemas/orders';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listAuditForEntity } from '../../lib/audit/repo';
import type { RequestContext, Role } from '../../lib/context';
import { orderContainers } from '../../lib/db/schema';
import { seedIdentity } from '../../lib/db/seeds/identity';
import { SEED_TENANTS, SEED_USERS } from '../../lib/db/seeds/identity.test-data';
import { seedMasterData } from '../../lib/db/seeds/master-data';
import {
  SEED_CUSTOMERS,
  SEED_LOCATIONS,
  SEED_ROUTES,
  SEED_SHIPPING_LINES,
} from '../../lib/db/seeds/master-data.test-data';
import { getTenantDb } from '../../lib/db/tenant-db';
import { startTestInfra, type TestInfra } from '../../test/containers';
import { createMasterDataRepo } from '../master-data/repo';
import { createOrderRepo } from './repo';
import { createOrderService, type OrderService } from './service';

// "Hôm nay" cố định: 22/10/2026 giờ Việt Nam.
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

// Số container hợp lệ theo ISO 6346 từ tiền tố 4 chữ và số serial.
let serial = 100000;
function containerNo(prefix = 'TEST') {
  const body = `${prefix.slice(0, 3)}U${String((serial += 1)).padStart(6, '0')}`;
  return `${body}${computeCheckDigit(body)}`;
}

describe('orders.service: tạo Order và sinh Stop', () => {
  let infra: TestInfra;
  let service: OrderService;

  const A = SEED_TENANTS.phucAn.id;
  const B = SEED_TENANTS.saoViet.id;
  const dispatcher = ctxOf(A, SEED_USERS.hungDv.id, 'DISPATCHER');
  const owner = ctxOf(A, SEED_USERS.owner.id, 'OWNER');
  const admin = ctxOf(A, SEED_USERS.admin.id, 'ADMIN');
  const accountant = ctxOf(A, SEED_USERS.accountant.id, 'ACCOUNTANT');
  const viewer = ctxOf(A, SEED_USERS.viewer.id, 'VIEWER');
  const dispatcherB = ctxOf(B, SEED_USERS.hungDv.id, 'DISPATCHER');

  const routeClSt = SEED_ROUTES[0];
  const routeClBh = SEED_ROUTES[1];
  const routeClVsip = SEED_ROUTES[2];
  const tdbA = () => getTenantDb({ tenantId: A }, { db: infra.db });
  const repoA = () => createOrderRepo(tdbA());
  const place = (code: string) => SEED_LOCATIONS.find((l) => l.tenantId === A && l.code === code)!;

  beforeAll(async () => {
    infra = await startTestInfra({ redis: false });
    await seedIdentity(infra.db, { password: 'mat-khau-thu-nghiem' });
    await seedMasterData(infra.db);
    service = createOrderService({
      tenantDb: (ctx) => getTenantDb(ctx, { db: infra.db }),
      now: () => NOW,
    });
    // Mẫu Stop nội địa cho CL-VSIP (CL-BH cố ý không có mẫu).
    for (const [index, stopType] of (
      ['PICK_EMPTY', 'STUFFING', 'UNSTUFFING', 'RETURN_EMPTY'] as const
    ).entries()) {
      await repoA().stopTemplates.insert({
        routeId: routeClVsip.id,
        sequenceNo: index + 1,
        stopType,
      });
    }
  });

  afterAll(async () => {
    await infra?.stop();
  });

  // Nhập qua đúng schema zod như Server Action để input luôn là dạng đã chuẩn hóa.
  function input(overrides: Record<string, unknown> = {}): CreateOrderInput {
    return createOrderInputSchema.parse({
      customerId: SEED_CUSTOMERS.thepNamLong.id,
      orderType: 'IMPORT',
      bookingOrBlNo: `bl-${Math.random().toString(36).slice(2, 8)}`,
      routeId: routeClSt.id,
      containers: [{ containerNo: containerNo(), containerType: '20DC' }],
      ...overrides,
    });
  }
  const conts = (n: number, extra: Record<string, unknown> = {}) =>
    Array.from({ length: n }, () => ({
      containerNo: containerNo(),
      containerType: '40HC',
      ...extra,
    }));

  it('Order IMPORT 5 cont sinh đúng 5 bộ Stop PICK_FULL → UNSTUFFING → RETURN_EMPTY (15 Stop)', async () => {
    const result = await service.createOrder(dispatcher, input({ containers: conts(5) }));
    const detail = await service.getOrder(dispatcher, result.order.id);

    expect(detail.order).toMatchObject({
      status: 'DRAFT',
      containerCount: 5,
      orderType: 'IMPORT',
      version: 0,
    });
    expect(detail.containers.map((c) => c.lineNo)).toEqual([1, 2, 3, 4, 5]);
    expect(detail.stops).toHaveLength(15);
    for (const container of detail.containers) {
      const stops = detail.stops.filter((s) => s.orderContainerId === container.id);
      expect(stops.map((s) => s.sequenceNo)).toEqual([1, 2, 3]);
      expect(stops.map((s) => s.stopType)).toEqual(['PICK_FULL', 'UNSTUFFING', 'RETURN_EMPTY']);
      expect(stops.every((s) => s.status === 'PENDING' && s.orderId === detail.order.id)).toBe(
        true,
      );
    }
    expect(detail.order.orderNo).toMatch(/^IMP-2610-\d{3}$/);
  });

  it('Order EXPORT sinh PICK_EMPTY → STUFFING → PORT_IN, cho phép cont chưa có số', async () => {
    const result = await service.createOrder(
      dispatcher,
      input({
        orderType: 'EXPORT',
        containers: [
          { containerNo: null, containerType: '40HC' },
          { containerNo: '', containerType: '20DC' },
        ],
      }),
    );
    const detail = await service.getOrder(dispatcher, result.order.id);

    expect(detail.order.orderNo).toMatch(/^EXP-2610-\d{3}$/);
    expect(detail.containers.map((c) => c.containerNo)).toEqual([null, null]);
    expect(detail.stops.map((s) => s.stopType).sort()).toEqual(
      ['PICK_EMPTY', 'STUFFING', 'PORT_IN', 'PICK_EMPTY', 'STUFFING', 'PORT_IN'].sort(),
    );
  });

  it('Order DOMESTIC sinh Stop theo mẫu của tuyến; tuyến chưa có mẫu thì bị chặn, không ghi gì', async () => {
    const ok = await service.createOrder(
      dispatcher,
      input({ orderType: 'DOMESTIC', routeId: routeClVsip.id, containers: conts(2) }),
    );
    const detail = await service.getOrder(dispatcher, ok.order.id);
    expect(detail.order.orderNo).toMatch(/^DOM-2610-\d{3}$/);
    expect(detail.stops).toHaveLength(8);
    expect(
      detail.stops
        .filter((s) => s.orderContainerId === detail.containers[0]!.id)
        .map((s) => s.stopType),
    ).toEqual(['PICK_EMPTY', 'STUFFING', 'UNSTUFFING', 'RETURN_EMPTY']);

    const before = (await repoA().orders.list()).length;
    const error = await expectAppError(
      service.createOrder(dispatcher, input({ orderType: 'DOMESTIC', routeId: routeClBh.id })),
      'VALIDATION_ERROR',
    );
    expect(error.message).toMatch(/chuỗi Stop nội địa/);
    expect((await repoA().orders.list()).length).toBe(before);
  });

  it('tuyến riêng của từng cont được dùng cho routeId của cont và tên điểm đóng hàng', async () => {
    const exportOrder = await service.createOrder(
      dispatcher,
      input({
        orderType: 'EXPORT',
        containers: [
          { containerNo: null, containerType: '20DC' },
          { containerNo: null, containerType: '20DC', routeId: routeClBh.id },
        ],
      }),
    );
    const detail = await service.getOrder(dispatcher, exportOrder.order.id);
    const cargoStop = (n: number) =>
      detail.stops.find(
        (s) => s.orderContainerId === detail.containers[n]!.id && s.stopType === 'STUFFING',
      )!;

    expect(detail.containers.map((c) => c.routeId)).toEqual([routeClSt.id, routeClBh.id]);
    expect(cargoStop(0).locationName).toBe(routeClSt.destinationZone);
    expect(cargoStop(1).locationName).toBe(routeClBh.destinationZone);
  });

  it('đơn nội địa có cont đi tuyến chưa có mẫu Stop thì bị chặn cả lần tạo', async () => {
    const before = (await repoA().orders.list()).length;
    await expectAppError(
      service.createOrder(
        dispatcher,
        input({
          orderType: 'DOMESTIC',
          routeId: routeClVsip.id,
          containers: [
            { containerNo: null, containerType: '20DC' },
            { containerNo: null, containerType: '20DC', routeId: routeClBh.id },
          ],
        }),
      ),
      'VALIDATION_ERROR',
    );
    expect((await repoA().orders.list()).length).toBe(before);
  });

  it('địa điểm được chọn gán vào Stop theo vai trò; hẹn Stop đầu ghi vào windowStart của Stop đầu', async () => {
    const result = await service.createOrder(
      dispatcher,
      input({
        pickupLocationId: place('CATLAI').id,
        cargoLocationId: place('KHO-PT').id,
        dropLocationId: place('DEPOT-PL').id,
        firstStopAt: '2026-10-25T01:00:00.000Z',
        containers: conts(1),
      }),
    );
    const detail = await service.getOrder(dispatcher, result.order.id);
    const stops = detail.stops.sort((a, b) => a.sequenceNo - b.sequenceNo);

    expect(stops.map((s) => s.locationId)).toEqual([
      place('CATLAI').id,
      place('KHO-PT').id,
      place('DEPOT-PL').id,
    ]);
    expect(stops.map((s) => s.locationName)).toEqual([
      'Cảng Cát Lái',
      'Kho Phúc Thịnh',
      'Depot Phước Long',
    ]);
    expect(stops[0]!.windowStart?.toISOString()).toBe('2026-10-25T01:00:00.000Z');
    expect(stops[1]!.windowStart).toBeNull();
  });

  it('ghi đủ thông tin chung của Order và dòng cont (seal, VGM, hàng nguy hiểm, DEM/DET)', async () => {
    const result = await service.createOrder(
      dispatcher,
      input({
        shippingLineId: SEED_SHIPPING_LINES[0].id,
        vesselVoyage: 'ONE HARMONY 042S',
        cutOffAt: '2026-10-30T09:35:00.000Z',
        customerRef: 'PO-77',
        cargoDescription: 'Thép cuộn',
        containers: [
          {
            containerNo: containerNo(),
            containerType: '40HC',
            sealNo: 'SL001',
            vgmTons: '27.5',
            cargoWeightTons: 25,
            isDangerousGoods: true,
            dgClass: '3',
            demFreeUntil: '2026-10-28T10:00:00.000Z',
            detFreeUntil: '2026-11-01T10:00:00.000Z',
          },
        ],
      }),
    );
    const detail = await service.getOrder(dispatcher, result.order.id);

    expect(detail.order).toMatchObject({
      shippingLineId: SEED_SHIPPING_LINES[0].id,
      vesselVoyage: 'ONE HARMONY 042S',
      customerRef: 'PO-77',
      cargoDescription: 'Thép cuộn',
      currency: 'VND',
      totalFreightAmount: '0.00',
    });
    expect(detail.order.cutOffAt?.toISOString()).toBe('2026-10-30T09:35:00.000Z');
    expect(detail.containers[0]).toMatchObject({
      sealNo: 'SL001',
      vgmTons: '27.50',
      cargoWeightTons: '25.00',
      isDangerousGoods: true,
      dgClass: '3',
      status: 'PENDING',
      baseFreightAmount: '0.00',
      isManualPrice: false,
    });
    expect(detail.containers[0]!.demFreeUntil?.toISOString()).toBe('2026-10-28T10:00:00.000Z');
  });

  it('orderNo tăng liên tục, không trùng kể cả khi tạo song song; sang tháng mới đánh số lại', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        service.createOrder(dispatcher, input({ orderType: 'EXPORT', containers: conts(1) })),
      ),
    );
    const numbers = results.map((r) => Number(r.order.orderNo.slice(-3))).sort((a, b) => a - b);

    expect(new Set(numbers).size).toBe(8);
    expect(numbers[7]! - numbers[0]!).toBe(7);

    const november = createOrderService({
      tenantDb: (ctx) => getTenantDb(ctx, { db: infra.db }),
      now: () => new Date('2026-11-02T05:00:00.000Z'),
    });
    const next = await november.createOrder(dispatcher, input({ orderType: 'EXPORT' }));
    expect(next.order.orderNo).toBe('EXP-2611-001');
  });

  it('YYMM theo múi giờ tenant: 23:30 UTC ngày 31/10 đã là tháng 11 ở Việt Nam', async () => {
    const lateNight = createOrderService({
      tenantDb: (ctx) => getTenantDb(ctx, { db: infra.db }),
      now: () => new Date('2026-12-31T18:00:00.000Z'), // 01/01/2027 01:00 giờ Việt Nam
    });
    const result = await lateNight.createOrder(dispatcher, input({ orderType: 'IMPORT' }));
    expect(result.order.orderNo).toBe('IMP-2701-001');
  });

  it('số container trùng trong Order hoặc hàng Nhập thiếu số bị chặn, không ghi gì', async () => {
    const no = containerNo();
    const before = (await repoA().orders.list()).length;
    const duplicated = {
      ...input(),
      containers: [
        { ...input().containers[0]!, containerNo: no },
        { ...input().containers[0]!, containerNo: no },
      ],
    };
    const missing = {
      ...input(),
      containers: [{ ...input().containers[0]!, containerNo: null }],
    };

    await expectAppError(service.createOrder(dispatcher, duplicated), 'VALIDATION_ERROR');
    await expectAppError(service.createOrder(dispatcher, missing), 'VALIDATION_ERROR');
    expect((await repoA().orders.list()).length).toBe(before);
  });

  it('cont trùng với cont đang hoạt động ở Order khác: tạo được kèm cảnh báo; đã hủy thì không cảnh báo', async () => {
    const no = containerNo();
    const first = await service.createOrder(
      dispatcher,
      input({ containers: [{ containerNo: no, containerType: '20DC' }] }),
    );
    const second = await service.createOrder(
      dispatcher,
      input({ containers: [{ containerNo: no, containerType: '20DC' }] }),
    );

    expect(first.warnings).toEqual([]);
    expect(second.warnings).toEqual([
      { containerNo: no, orderId: first.order.id, orderNo: first.order.orderNo },
    ]);

    await repoA().containers.updateWhere(eq(orderContainers.orderId, first.order.id), {
      status: 'CANCELLED',
    });
    const third = await service.createOrder(
      dispatcher,
      input({ containers: [{ containerNo: no, containerType: '20DC' }] }),
    );
    expect(third.warnings.map((w) => w.orderId)).toEqual([second.order.id]);
  });

  it('khách, tuyến, hãng tàu hoặc địa điểm của công ty khác bị từ chối', async () => {
    const otherCustomer = SEED_CUSTOMERS.saoVietThep.id;
    const otherRoute = SEED_ROUTES[3].id;
    const otherLine = SEED_SHIPPING_LINES.find((l) => l.tenantId === B)!.id;
    const otherPlace = SEED_LOCATIONS.find((l) => l.tenantId === B)!.id;

    for (const override of [
      { customerId: otherCustomer },
      { routeId: otherRoute },
      { shippingLineId: otherLine },
      { pickupLocationId: otherPlace },
      { containers: [{ containerNo: null, containerType: '20DC', routeId: otherRoute }] },
    ]) {
      const error = await expectAppError(
        service.createOrder(dispatcher, input({ orderType: 'EXPORT', ...override })),
        'VALIDATION_ERROR',
      );
      expect(error.details?.field).toBeTruthy();
    }
  });

  it('khách hoặc tuyến đã xóa mềm không dùng được cho Order mới', async () => {
    const master = createMasterDataRepo(tdbA());
    const customer = await master.customers.insert({ code: 'KH-XOA', name: 'Khách đã xóa' });
    await master.customers.update(customer.id, { deletedAt: new Date() });

    await expectAppError(
      service.createOrder(dispatcher, input({ customerId: customer.id })),
      'VALIDATION_ERROR',
    );
  });

  it('ghi audit CREATE cùng transaction, kèm danh sách container', async () => {
    const result = await service.createOrder(dispatcher, input({ containers: conts(2) }));
    const audit = await listAuditForEntity(tdbA(), 'orders', result.order.id);

    expect(audit.map((a) => a.action)).toEqual(['CREATE']);
    expect(audit[0]!.actorUserId).toBe(SEED_USERS.hungDv.id);
    expect(audit[0]!.after).toMatchObject({
      orderNo: result.order.orderNo,
      status: 'DRAFT',
      containerCount: 2,
    });
    expect((audit[0]!.after as { containers: unknown[] }).containers).toHaveLength(2);
  });

  it('chỉ Chủ công ty, Quản trị, Điều vận tạo được Order; Kế toán và Chỉ xem bị FORBIDDEN', async () => {
    const before = (await repoA().orders.list()).length;
    await service.createOrder(owner, input());
    await service.createOrder(admin, input());
    await service.createOrder(dispatcher, input());
    await expectAppError(service.createOrder(accountant, input()), 'FORBIDDEN');
    await expectAppError(service.createOrder(viewer, input()), 'FORBIDDEN');

    expect((await repoA().orders.list()).length).toBe(before + 3);
  });

  it('tenant B không đọc được Order của tenant A và ngược lại', async () => {
    const created = await service.createOrder(dispatcher, input());

    await expectAppError(service.getOrder(dispatcherB, created.order.id), 'NOT_FOUND');
    await expectAppError(service.getOrder(dispatcher, 'khong-ton-tai'), 'NOT_FOUND');
    expect((await service.getOrder(dispatcher, created.order.id)).order.id).toBe(created.order.id);
  });

  it('mọi ai trong công ty có quyền xem đều đọc được chi tiết Order', async () => {
    const created = await service.createOrder(dispatcher, input());
    for (const ctx of [viewer, accountant, owner]) {
      expect((await service.getOrder(ctx, created.order.id)).order.id).toBe(created.order.id);
    }
  });

  it('mẫu Stop nội địa: lưu thay thế mẫu cũ, ghi audit, chỉ ảnh hưởng Order tạo sau', async () => {
    const route = await createMasterDataRepo(tdbA()).routes.insert({
      routeCode: 'TPL-1',
      name: 'Tuyến thử mẫu',
      originZone: 'Cát Lái',
      destinationZone: 'Long An',
      standardDistanceKm: 60,
    });

    await service.setRouteStopTemplate(dispatcher, route.id, ['PICK_EMPTY', 'STUFFING', 'PORT_IN']);
    const first = await service.createOrder(
      dispatcher,
      input({ orderType: 'DOMESTIC', routeId: route.id, containers: conts(1) }),
    );
    await service.setRouteStopTemplate(admin, route.id, ['PICK_FULL', 'UNSTUFFING']);
    const second = await service.createOrder(
      dispatcher,
      input({ orderType: 'DOMESTIC', routeId: route.id, containers: conts(1) }),
    );

    expect(await service.getRouteStopTemplate(viewer, route.id)).toEqual([
      'PICK_FULL',
      'UNSTUFFING',
    ]);
    expect(
      (await service.getOrder(dispatcher, first.order.id)).stops.map((s) => s.stopType),
    ).toEqual(['PICK_EMPTY', 'STUFFING', 'PORT_IN']);
    expect(
      (await service.getOrder(dispatcher, second.order.id)).stops.map((s) => s.stopType),
    ).toEqual(['PICK_FULL', 'UNSTUFFING']);
    const audit = await listAuditForEntity(tdbA(), 'route_stop_templates', route.id);
    expect(audit.map((a) => a.action)).toEqual(['UPDATE', 'UPDATE']);
    expect(audit[0]!.before).toEqual({ stopTypes: ['PICK_EMPTY', 'STUFFING', 'PORT_IN'] });
    expect(audit[0]!.after).toEqual({ stopTypes: ['PICK_FULL', 'UNSTUFFING'] });
  });

  it('mẫu Stop nội địa: cần quyền ghi danh mục, tuyến phải thuộc công ty và chuỗi không rỗng', async () => {
    await expectAppError(
      service.setRouteStopTemplate(accountant, routeClSt.id, ['PICK_FULL']),
      'FORBIDDEN',
    );
    await expectAppError(
      service.setRouteStopTemplate(dispatcherB, routeClSt.id, ['PICK_FULL']),
      'VALIDATION_ERROR',
    );
    await expectAppError(
      service.setRouteStopTemplate(dispatcher, routeClSt.id, []),
      'VALIDATION_ERROR',
    );
  });

  it('danh sách Order: mới nhất trước, kèm container theo dòng, không lẫn tenant khác', async () => {
    const first = await service.createOrder(dispatcher, input({ containers: conts(2) }));
    const second = await service.createOrder(
      dispatcher,
      input({ orderType: 'EXPORT', containers: conts(3) }),
    );
    const other = await service.createOrder(
      dispatcherB,
      input({
        customerId: SEED_CUSTOMERS.saoVietThep.id,
        routeId: SEED_ROUTES[3].id,
        containers: conts(1),
      }),
    );

    const list = await service.listOrders(viewer);
    const ids = list.map((row) => row.order.id);

    expect(ids.indexOf(second.order.id)).toBeLessThan(ids.indexOf(first.order.id));
    expect(ids).not.toContain(other.order.id);
    const row = list.find((r) => r.order.id === second.order.id)!;
    expect(row.containers.map((c) => c.lineNo)).toEqual([1, 2, 3]);
    expect(row.containers.every((c) => c.orderId === second.order.id)).toBe(true);
    expect((await service.listOrders(dispatcherB)).map((r) => r.order.id)).toContain(
      other.order.id,
    );
  });

  it('lịch sử Order: audit của chính Order, mới nhất trước; Order của công ty khác trả NOT_FOUND', async () => {
    const created = await service.createOrder(dispatcher, input({ containers: conts(1) }));
    // Bộ test này không nạp bảng giá nên tạo thêm một dòng lịch sử bằng giá tay thay vì xác nhận.
    await service.setManualPrice(dispatcher, {
      orderId: created.order.id,
      containerId: created.containers[0]!.id,
      version: created.order.version,
      price: '1500000.00',
      reason: 'Khách báo giá',
    });

    const history = await service.getOrderHistory(viewer, created.order.id);

    expect(history.map((h) => h.action).sort()).toEqual(['CREATE', 'MANUAL_PRICE']);
    expect(history.every((h) => h.entityId === created.order.id)).toBe(true);
    await expectAppError(service.getOrderHistory(dispatcherB, created.order.id), 'NOT_FOUND');
  });

  it('danh sách mẫu Stop theo tuyến và cảnh báo số container trùng ở Order khác', async () => {
    const templates = await service.listRouteStopTemplates(viewer);
    expect(templates[routeClVsip.id]).toEqual([
      'PICK_EMPTY',
      'STUFFING',
      'UNSTUFFING',
      'RETURN_EMPTY',
    ]);
    expect(Object.keys(await service.listRouteStopTemplates(dispatcherB))).not.toContain(
      routeClVsip.id,
    );

    const no = containerNo();
    const first = await service.createOrder(
      dispatcher,
      input({ containers: [{ containerNo: no, containerType: '20DC' }] }),
    );
    const second = await service.createOrder(
      dispatcher,
      input({ containers: [{ containerNo: no, containerType: '20DC' }] }),
    );
    const warnings = await service.getContainerWarnings(viewer, second.order.id);

    expect(warnings).toEqual([
      { containerNo: no, orderId: first.order.id, orderNo: first.order.orderNo },
    ]);
    await expectAppError(service.getContainerWarnings(dispatcherB, second.order.id), 'NOT_FOUND');
  });
});
